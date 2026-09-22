import { readFileSync } from "node:fs";
import path from "node:path";

import QRCode from "qrcode";
import sharp from "sharp";

import type {
  StudentCardRenderSnapshot,
} from "@/db/schema";
import {
  defaultCardTextMaxWidth,
  fitCardTextNormalized,
} from "@/lib/card-text-fit";

import {
  getPrivateCardObject,
  putPrivateCardObject,
} from "./storage";
import {
  parseCardTemplateLayout,
  type CardTemplateLayout,
  type CardTextSource,
} from "./template-layout";

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

function escapeXml(
  value: string,
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

const CARD_TEXT_FONT_FAMILY =
  "Noto Sans";

const CARD_TEXT_FONT_FILE =
  path.join(
    process.cwd(),
    "src",
    "server",
    "card-production",
    "fonts",
    "NotoSans.ttf",
  );

const CARD_TEXT_FONT_BYTES =
  readFileSync(
    CARD_TEXT_FONT_FILE,
  );

if (
  CARD_TEXT_FONT_BYTES.length <
  500000
) {
  throw new Error(
    "CARD_TEXT_FONT_BUNDLE_INVALID",
  );
}

async function textOverlays(
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
): Promise<
  Parameters<
    ReturnType<
      typeof sharp
    >["composite"]
  >[0]
> {
  const overlays:
    Parameters<
      ReturnType<
        typeof sharp
      >["composite"]
    >[0] = [];

  for (
    const item of
      input.items.filter(
        (candidate) =>
          candidate.source !==
            "ACADEMIC_SESSION" &&
          candidate.source !==
            "CLASS",
      )
  ) {
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

    if (
      !value.trim()
    ) {
      continue;
    }

    const requestedFontSize =
      Math.max(
        0.008,
        item.fontSize,
      );

    const minimumFontSize =
      Math.min(
        requestedFontSize,
        Math.max(
          0.006,
          item.minFontSize ??
            Math.max(
              requestedFontSize *
                0.58,
              0.006,
            ),
        ),
      );

    const maxWidth =
      item.maxWidth ??
      defaultCardTextMaxWidth({
        x:
          item.x,
        align:
          item.align,
      });

    const defaultLines =
      item.source ===
        "STUDENT_NAME" ||
      item.source ===
        "SCHOOL_NAME"
        ? 2
        : 1;

    const fitted =
      fitCardTextNormalized({
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

    const x =
      item.x *
      input.width;

    const centerY =
      item.y *
      input.height;

    const fontSize =
      fitted.fontSize *
      input.width;

    const lineHeight =
      Math.max(
        1,
        fontSize *
          1.08,
      );

    for (
      const [
        index,
        line,
      ] of
        fitted.lines.entries()
    ) {
      const offset =
        (
          index -
          (
            fitted.lines.length -
            1
          ) /
            2
        ) *
        lineHeight;

      const y =
        centerY +
        offset;

      const overlay =
        await sharp({
          text: {
            text:
              `<span foreground="${item.color}" weight="${item.weight}" size="${Math.max(
                1,
                fontSize,
              ).toFixed(
                2,
              )}pt">${escapeXml(
                line,
              )}</span>`,
            font:
              CARD_TEXT_FONT_FAMILY,
            fontfile:
              CARD_TEXT_FONT_FILE,
            rgba: true,
            dpi: 72,
            wrap:
              "none",
          },
        })
          .png()
          .toBuffer();

      const meta =
        await sharp(
          overlay,
        ).metadata();

      if (
        !meta.width ||
        !meta.height
      ) {
        throw new Error(
          "CARD_TEXT_OVERLAY_DIMENSIONS_UNAVAILABLE",
        );
      }

      const rawLeft =
        item.align ===
          "CENTER"
          ? x -
            meta.width /
              2
          : item.align ===
              "RIGHT"
            ? x -
              meta.width
            : x;

      const rawTop =
        y -
        meta.height /
          2;

      overlays.push({
        input:
          overlay,
        left:
          Math.max(
            0,
            Math.round(
              rawLeft,
            ),
          ),
        top:
          Math.max(
            0,
            Math.round(
              rawTop,
            ),
          ),
      });
    }
  }

  return overlays;
}

export async function probeCardTextRuntime(): Promise<{
  healthy: boolean;
  sampleABytes: number;
  sampleBBytes: number;
  fontFileBytes: number;
}> {
  const renderProbe =
    async (
      value:
        string,
    ) =>
      sharp({
        text: {
          text:
            `<span foreground="#000000" weight="700" size="44pt">${escapeXml(
              value,
            )}</span>`,
          font:
            CARD_TEXT_FONT_FAMILY,
          fontfile:
            CARD_TEXT_FONT_FILE,
          rgba: true,
          dpi: 72,
          wrap:
            "none",
        },
      })
        .png()
        .toBuffer();

  const [
    sampleA,
    sampleB,
  ] =
    await Promise.all([
      renderProbe(
        "CASA SCHOOL",
      ),
      renderProbe(
        "AYỌMÍDÉ ỌLÁYÍWỌLÁ",
      ),
    ]);

  return {
    healthy:
      CARD_TEXT_FONT_BYTES.length >=
        500000 &&
      sampleA.length >
        300 &&
      sampleB.length >
        300 &&
      !sampleA.equals(
        sampleB,
      ),
    sampleABytes:
      sampleA.length,
    sampleBBytes:
      sampleB.length,
    fontFileBytes:
      CARD_TEXT_FONT_BYTES.length,
  };
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
    qrPayload?:
      string;
    qrImage?:
      Buffer | null;
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
      await textOverlays({
        width,
        height,
        snapshot:
          input.snapshot,
        items,
      });

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
      input.qrImage
        ? await sharp(
            input.qrImage,
          )
            .resize(
              qrSize,
              qrSize,
              {
                fit:
                  "fill",
              },
            )
            .png()
            .toBuffer()
        : input.qrPayload
          ? await QRCode.toBuffer(
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
            )
          : (() => {
              throw new Error(
                "CARD_QR_SOURCE_UNAVAILABLE",
              );
            })();

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

export async function renderExistingStudentCardPreview(
  input: {
    frontSource:
      Buffer;
    backSource:
      Buffer;
    frontArtifact:
      Buffer;
    backArtifact:
      Buffer;
    layout:
      unknown;
    snapshot:
      StudentCardRenderSnapshot;
  },
): Promise<Buffer> {
  const layout =
    parseCardTemplateLayout(
      input.layout,
    );

  const qrArtifact =
    layout.qr.side ===
      "FRONT"
      ? input.frontArtifact
      : input.backArtifact;

  const qrMeta =
    await sharp(
      qrArtifact,
    ).metadata();

  if (
    !qrMeta.width ||
    !qrMeta.height
  ) {
    throw new Error(
      "CARD_EXISTING_QR_DIMENSIONS_UNAVAILABLE",
    );
  }

  const intendedSize =
    Math.max(
      64,
      Math.round(
        layout.qr.size *
          qrMeta.width,
      ),
    );
  const left =
    Math.max(
      0,
      Math.min(
        qrMeta.width - 1,
        Math.round(
          layout.qr.x *
            qrMeta.width,
        ),
      ),
    );
  const top =
    Math.max(
      0,
      Math.min(
        qrMeta.height - 1,
        Math.round(
          layout.qr.y *
            qrMeta.height,
        ),
      ),
    );
  const cropSize =
    Math.min(
      intendedSize,
      qrMeta.width -
        left,
      qrMeta.height -
        top,
    );

  if (
    cropSize <
      24
  ) {
    throw new Error(
      "CARD_EXISTING_QR_CROP_UNAVAILABLE",
    );
  }

  const preservedQr =
    await sharp(
      qrArtifact,
    )
      .extract({
        left,
        top,
        width:
          cropSize,
        height:
          cropSize,
      })
      .png()
      .toBuffer();

  const [
    front,
    back,
  ] =
    await Promise.all([
      renderSide({
        source:
          input.frontSource,
        side:
          "FRONT",
        layout,
        snapshot:
          input.snapshot,
        qrImage:
          layout.qr.side ===
            "FRONT"
            ? preservedQr
            : null,
      }),
      renderSide({
        source:
          input.backSource,
        side:
          "BACK",
        layout,
        snapshot:
          input.snapshot,
        qrImage:
          layout.qr.side ===
            "BACK"
            ? preservedQr
            : null,
      }),
    ]);

  return previewBuffer(
    front,
    back,
  );
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
    artifactRevision?:
      string | null;
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

  const revision =
    input.artifactRevision
      ?.replace(
        /[^A-Za-z0-9_-]/g,
        "",
      )
      .slice(
        0,
        80,
      ) ||
    null;
  const prefix =
    revision
      ? `card-production/jobs/${input.jobId}/revisions/${revision}`
      : `card-production/jobs/${input.jobId}`;

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

export async function renderStudentCardTemplatePreviewSide(input: {
  side: "FRONT" | "BACK";
  template: {
    frontSourceKey: string;
    backSourceKey: string;
    layout: unknown;
  };
  snapshot: StudentCardRenderSnapshot;
  qrPayload?: string;
}) {
  const layout = parseCardTemplateLayout(input.template.layout);
  const source = await getPrivateCardObject(
    input.side === "BACK" ? input.template.backSourceKey : input.template.frontSourceKey,
  );
  if (!source) throw new Error("CARD_TEMPLATE_SOURCE_MISSING");
  return renderSide({
    source,
    side: input.side,
    layout,
    snapshot: input.snapshot,
    qrPayload: input.qrPayload ?? "CASA:SAMPLE:PREVIEW",
  });
}
