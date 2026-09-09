import QRCode from "qrcode";
import sharp from "sharp";

import type {
  StudentCardRenderSnapshot,
} from "@/db/schema";

import {
  getPrivateCardObject,
  putPrivateCardObject,
} from "./storage";
import {
  parseCardTemplateLayout,
  type CardTemplateLayout,
  type CardTextSource,
} from "./template-layout";

function escapeXml(
  value:
    string,
): string {
  return value
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&apos;",
    );
}

function resolveText(
  snapshot:
    StudentCardRenderSnapshot,
  source:
    CardTextSource,
): string {
  const mapping:
    Record<
      CardTextSource,
      string
    > = {
      SCHOOL_NAME:
        snapshot.schoolName,
      STUDENT_NAME:
        snapshot.studentName,
      SEX:
        snapshot.sex,
      CLASS:
        "",
      // Pass A: academic session is intentionally not a physical-card field.
      // Legacy templates that still contain this source render it blank.
      ACADEMIC_SESSION:
        "",
    };

  return mapping[
    source
  ];
}

function truncate(
  value: string,
  maxCharacters:
    number | undefined,
): string {
  if (
    !maxCharacters ||
    value.length <=
      maxCharacters
  ) {
    return value;
  }

  if (
    maxCharacters <= 1
  ) {
    return value.slice(
      0,
      maxCharacters,
    );
  }

  return `${value.slice(
    0,
    maxCharacters - 1,
  )}…`;
}

function textAnchor(
  align:
    "LEFT" |
    "CENTER" |
    "RIGHT",
): "start" |
  "middle" |
  "end" {
  if (
    align ===
    "CENTER"
  ) {
    return "middle";
  }

  if (
    align ===
    "RIGHT"
  ) {
    return "end";
  }

  return "start";
}

function estimatedGlyphFactor(
  character: string,
): number {
  if (/\s/.test(character)) {
    return 0.32;
  }

  if (/[ilI1.,'`|!:;]/.test(character)) {
    return 0.3;
  }

  if (/[MW@#%&]/.test(character)) {
    return 0.88;
  }

  if (/[A-Z0-9]/.test(character)) {
    return 0.62;
  }

  return 0.54;
}

function estimateLineWidth(
  value: string,
  fontSize: number,
): number {
  return Array.from(value)
    .reduce(
      (total, character) =>
        total +
        estimatedGlyphFactor(
          character,
        ) *
          fontSize,
      0,
    );
}

function defaultMaxWidth(
  input: {
    width: number;
    x: number;
    align:
      | "LEFT"
      | "CENTER"
      | "RIGHT";
  },
): number {
  const gutter =
    input.width * 0.025;

  if (
    input.align ===
    "LEFT"
  ) {
    return Math.max(
      input.width * 0.08,
      input.width -
        input.x -
        gutter,
    );
  }

  if (
    input.align ===
    "RIGHT"
  ) {
    return Math.max(
      input.width * 0.08,
      input.x -
        gutter,
    );
  }

  return Math.max(
    input.width * 0.08,
    2 *
      Math.min(
        input.x -
          gutter,
        input.width -
          input.x -
          gutter,
      ),
  );
}

function splitLongWord(
  word: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const pieces: string[] = [];
  let current = "";

  for (const character of Array.from(word)) {
    const candidate =
      `${current}${character}`;

    if (
      current &&
      estimateLineWidth(
        candidate,
        fontSize,
      ) > maxWidth
    ) {
      pieces.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }

  if (current) {
    pieces.push(current);
  }

  return pieces;
}

function wrapText(
  value: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) =>
      estimateLineWidth(
        word,
        fontSize,
      ) <= maxWidth
        ? [word]
        : splitLongWord(
            word,
            maxWidth,
            fontSize,
          ),
    );

  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current
      ? `${current} ${word}`
      : word;

    if (
      current &&
      estimateLineWidth(
        candidate,
        fontSize,
      ) > maxWidth
    ) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function fitText(
  input: {
    value: string;
    fontSize: number;
    minFontSize: number;
    maxWidth: number;
    maxLines: number;
  },
) {
  let fontSize =
    input.fontSize;

  while (
    fontSize >
      input.minFontSize
  ) {
    const lines =
      wrapText(
        input.value,
        input.maxWidth,
        fontSize,
      );

    if (
      lines.length <=
      input.maxLines
    ) {
      return {
        fontSize,
        lines,
      };
    }

    fontSize =
      Math.max(
        input.minFontSize,
        fontSize - 1,
      );
  }

  const lines =
    wrapText(
      input.value,
      input.maxWidth,
      fontSize,
    );

  if (
    lines.length <=
    input.maxLines
  ) {
    return {
      fontSize,
      lines,
    };
  }

  const kept = lines.slice(
    0,
    input.maxLines,
  );
  let finalLine =
    kept[
      kept.length - 1
    ] ?? "";

  while (
    finalLine.length > 1 &&
    estimateLineWidth(
      `${finalLine}…`,
      fontSize,
    ) > input.maxWidth
  ) {
    finalLine =
      finalLine.slice(
        0,
        -1,
      );
  }

  kept[
    kept.length - 1
  ] = `${finalLine.trimEnd()}…`;

  return {
    fontSize,
    lines: kept,
  };
}

function textSvg(
  input: {
    width: number;
    height: number;
    snapshot:
      StudentCardRenderSnapshot;
    items:
      CardTemplateLayout[
        "frontText"
      ];
  },
): Buffer {
  const text =
    input.items
      .filter(
        (item) =>
          item.source !==
            "ACADEMIC_SESSION" &&
          item.source !==
            "CLASS",
      )
      .map(
        (item) => {
          let value =
            resolveText(
              input.snapshot,
              item.source,
            );

          value =
            truncate(
              value,
              item.maxCharacters,
            );

          if (
            item.uppercase
          ) {
            value =
              value.toUpperCase();
          }

          if (!value.trim()) {
            return "";
          }

          const x =
            Math.round(
              item.x *
                input.width,
            );
          const y =
            Math.round(
              item.y *
                input.height,
            );
          const requestedFontSize =
            Math.max(
              8,
              Math.round(
                item.fontSize *
                  input.width,
              ),
            );
          const minimumFontSize =
            Math.max(
              7,
              Math.min(
                requestedFontSize,
                Math.round(
                  (item.minFontSize ??
                    Math.max(
                      item.fontSize *
                        0.58,
                      0.006,
                    )) *
                    input.width,
                ),
              ),
            );
          const maxWidth =
            Math.max(
              24,
              item.maxWidth
                ? item.maxWidth *
                  input.width
                : defaultMaxWidth({
                    width:
                      input.width,
                    x,
                    align:
                      item.align,
                  }),
            );
          const defaultLines =
            item.source ===
              "STUDENT_NAME" ||
            item.source ===
              "SCHOOL_NAME" ||
            item.source ===
              "CLASS"
              ? 2
              : 1;
          const fitted =
            fitText({
              value,
              fontSize:
                requestedFontSize,
              minFontSize:
                minimumFontSize,
              maxWidth,
              maxLines:
                item.maxLines ??
                defaultLines,
            });
          const lineHeight =
            Math.max(
              fitted.fontSize + 1,
              Math.round(
                fitted.fontSize *
                  1.08,
              ),
            );
          const tspans =
            fitted.lines
              .map(
                (line, index) =>
                  `<tspan x="${x}" dy="${
                    index === 0
                      ? 0
                      : lineHeight
                  }">${escapeXml(
                    line,
                  )}</tspan>`,
              )
              .join("");

          return `<text x="${x}" y="${y}" text-anchor="${textAnchor(
            item.align,
          )}" font-family="Arial, Helvetica, sans-serif" font-size="${fitted.fontSize}" font-weight="${item.weight}" fill="${item.color}">${tspans}</text>`;
        },
      )
      .join("");

  return Buffer.from(
    `<svg width="${input.width}" height="${input.height}" xmlns="http://www.w3.org/2000/svg">${text}</svg>`,
    "utf8",
  );
}

async function renderSide(
  input: {
    source:
      Buffer;
    side:
      "FRONT" |
      "BACK";
    layout:
      CardTemplateLayout;
    snapshot:
      StudentCardRenderSnapshot;
    qrPayload:
      string;
  },
): Promise<Buffer> {
  const image =
    sharp(
      input.source,
    );

  const metadata =
    await image.metadata();

  if (
    !metadata.width ||
    !metadata.height
  ) {
    throw new Error(
      "CARD_TEMPLATE_DIMENSIONS_UNAVAILABLE",
    );
  }

  const width =
    metadata.width;
  const height =
    metadata.height;

  const items =
    input.side ===
      "FRONT"
      ? input.layout
          .frontText
      : input.layout
          .backText;

  const composites:
    Parameters<ReturnType<typeof sharp>["composite"]>[0] =
      [
        {
          input:
            textSvg({
              width,
              height,
              snapshot:
                input.snapshot,
              items,
            }),
          left: 0,
          top: 0,
        },
      ];

  if (
    input.layout.qr
      .side ===
    input.side
  ) {
    const qrSize =
      Math.max(
        64,
        Math.round(
          input.layout
            .qr.size *
            width,
        ),
      );

    const qr =
      await QRCode.toBuffer(
        input.qrPayload,
        {
          type:
            "png",
          width:
            qrSize,
          margin: 1,
          errorCorrectionLevel:
            "M",
        },
      );

    composites.push({
      input:
        qr,
      left:
        Math.round(
          input.layout
            .qr.x *
            width,
        ),
      top:
        Math.round(
          input.layout
            .qr.y *
            height,
        ),
    });
  }

  return image
    .composite(
      composites,
    )
    .png()
    .toBuffer();
}

async function previewBuffer(
  front:
    Buffer,
  back:
    Buffer,
): Promise<Buffer> {
  const frontMeta =
    await sharp(
      front,
    ).metadata();

  const backMeta =
    await sharp(
      back,
    ).metadata();

  if (
    !frontMeta.width ||
    !frontMeta.height ||
    !backMeta.width ||
    !backMeta.height
  ) {
    throw new Error(
      "CARD_PREVIEW_DIMENSIONS_UNAVAILABLE",
    );
  }

  const targetWidth =
    Math.max(
      frontMeta.width,
      backMeta.width,
    );
  const gap =
    Math.max(
      20,
      Math.round(
        targetWidth *
          0.04,
      ),
    );

  const frontNormalized =
    await sharp(
      front,
    )
      .resize({
        width:
          targetWidth,
      })
      .png()
      .toBuffer();

  const backNormalized =
    await sharp(
      back,
    )
      .resize({
        width:
          targetWidth,
      })
      .png()
      .toBuffer();

  const frontNormalizedMeta =
    await sharp(
      frontNormalized,
    ).metadata();

  const backNormalizedMeta =
    await sharp(
      backNormalized,
    ).metadata();

  const frontHeight =
    frontNormalizedMeta
      .height ??
    frontMeta.height;
  const backHeight =
    backNormalizedMeta
      .height ??
    backMeta.height;

  const totalHeight =
    frontHeight +
    gap +
    backHeight;

  return sharp({
    create: {
      width:
        targetWidth,
      height:
        totalHeight,
      channels: 4,
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1,
      },
    },
  })
    .composite([
      {
        input:
          frontNormalized,
        left: 0,
        top: 0,
      },
      {
        input:
          backNormalized,
        left: 0,
        top:
          frontHeight +
          gap,
      },
    ])
    .png()
    .toBuffer();
}

export async function renderAndStoreStudentCard(
  input: {
    jobId: string;
    qrPayload: string;
    template: {
      frontSourceKey:
        string;
      backSourceKey:
        string;
      layout:
        unknown;
    };
    snapshot:
      StudentCardRenderSnapshot;
  },
) {
  const layout =
    parseCardTemplateLayout(
      input.template.layout,
    );

  const [
    frontSource,
    backSource,
  ] =
    await Promise.all([
      getPrivateCardObject(
        input.template
          .frontSourceKey,
      ),
      getPrivateCardObject(
        input.template
          .backSourceKey,
      ),
    ]);

  if (
    !frontSource ||
    !backSource
  ) {
    throw new Error(
      "CARD_TEMPLATE_SOURCE_MISSING",
    );
  }

  const [
    front,
    back,
  ] =
    await Promise.all([
      renderSide({
        source:
          frontSource,
        side:
          "FRONT",
        layout,
        snapshot:
          input.snapshot,
        qrPayload:
          input.qrPayload,
      }),
      renderSide({
        source:
          backSource,
        side:
          "BACK",
        layout,
        snapshot:
          input.snapshot,
        qrPayload:
          input.qrPayload,
      }),
    ]);

  const preview =
    await previewBuffer(
      front,
      back,
    );

  const prefix =
    `card-production/jobs/${input.jobId}`;

  const keys = {
    front:
      `${prefix}/front.png`,
    back:
      `${prefix}/back.png`,
    preview:
      `${prefix}/preview.png`,
  };

  await putPrivateCardObject({
    key:
      keys.front,
    body:
      front,
    contentType:
      "image/png",
  });

  await putPrivateCardObject({
    key:
      keys.back,
    body:
      back,
    contentType:
      "image/png",
  });

  await putPrivateCardObject({
    key:
      keys.preview,
    body:
      preview,
    contentType:
      "image/png",
  });

  return keys;
}
