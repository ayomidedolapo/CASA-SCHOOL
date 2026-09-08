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
        snapshot.className ??
        "",
      ACADEMIC_SESSION:
        snapshot.academicSession ??
        "",
    };

  return mapping[
    source
  ];
}

function truncate(
  value:
    string,
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
    maxCharacters <=
    4
  ) {
    return value.slice(
      0,
      maxCharacters,
    );
  }

  return (
    value.slice(
      0,
      maxCharacters -
        1,
    ) +
    "Ã¢â‚¬Â¦"
  );
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
    input.items.map(
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
        const fontSize =
          Math.max(
            8,
            Math.round(
              item.fontSize *
                input.width,
            ),
          );

        return `<text x="${x}" y="${y}" text-anchor="${textAnchor(
          item.align,
        )}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${item.weight}" fill="${item.color}">${escapeXml(
          value,
        )}</text>`;
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