import sharp from "sharp";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";

import {
  getCurrentCardProductionPreview,
} from "./live-preview";
import {
  getPrivateCardObject,
} from "./storage";
import {
  parseCardTemplateLayout,
} from "./template-layout";

function rowsOf<T>(
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(
      (
        result as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      result as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

function clamp(
  value: number,
  minimum: number,
  maximum: number,
) {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      value,
    ),
  );
}

export async function getSchoolWatermarkedCardProductionPreview(
  input: {
    schoolId: string;
    studentId: string;
    jobId: string;
  },
): Promise<Buffer | null> {
  const row =
    rowsOf<{
      front_artifact_key:
        string;
      back_artifact_key:
        string;
      layout:
        unknown;
    }>(
      await getDb()
        .execute(sql`
          select
            job.front_artifact_key,
            job.back_artifact_key,
            template.layout
          from student_card_production_jobs
            job
          join student_card_templates
            template
            on template.id =
               job.template_id
          where
            job.school_id =
              ${input.schoolId}::uuid
            and job.student_id =
              ${input.studentId}::uuid
            and job.id =
              ${input.jobId}::uuid
          limit 1
        `),
    )[0];

  if (!row) {
    return null;
  }

  const [
    preview,
    frontArtifact,
    backArtifact,
  ] =
    await Promise.all([
      getCurrentCardProductionPreview(
        input.jobId,
      ),
      getPrivateCardObject(
        row.front_artifact_key,
      ),
      getPrivateCardObject(
        row.back_artifact_key,
      ),
    ]);

  // Security boundary: a school preview is never allowed to fall back
  // to the clean artifact when the watermark cannot be positioned.
  if (
    !preview ||
    !frontArtifact ||
    !backArtifact
  ) {
    return null;
  }

  const layout =
    parseCardTemplateLayout(
      row.layout,
    );

  const [
    previewMeta,
    frontMeta,
    backMeta,
  ] =
    await Promise.all([
      sharp(
        preview,
      ).metadata(),
      sharp(
        frontArtifact,
      ).metadata(),
      sharp(
        backArtifact,
      ).metadata(),
    ]);

  if (
    !previewMeta.width ||
    !previewMeta.height ||
    !frontMeta.width ||
    !frontMeta.height ||
    !backMeta.width ||
    !backMeta.height
  ) {
    return null;
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

  const frontScale =
    targetWidth /
    frontMeta.width;
  const backScale =
    targetWidth /
    backMeta.width;

  const frontHeight =
    Math.round(
      frontMeta.height *
        frontScale,
    );

  const qrSide =
    layout.qr.side;

  const sourceWidth =
    qrSide ===
      "FRONT"
      ? frontMeta.width
      : backMeta.width;
  const sourceHeight =
    qrSide ===
      "FRONT"
      ? frontMeta.height
      : backMeta.height;
  const scale =
    qrSide ===
      "FRONT"
      ? frontScale
      : backScale;

  const rawQrSize =
    Math.max(
      64,
      Math.round(
        layout.qr.size *
          sourceWidth,
      ),
    );
  const qrSize =
    Math.max(
      32,
      Math.round(
        rawQrSize *
          scale,
      ),
    );

  const qrLeft =
    Math.round(
      layout.qr.x *
        sourceWidth *
        scale,
    );
  const qrTop =
    (
      qrSide ===
        "FRONT"
        ? 0
        : frontHeight +
          gap
    ) +
    Math.round(
      layout.qr.y *
        sourceHeight *
        scale,
    );

  const watermarkWidth =
    Math.max(
      40,
      Math.round(
        qrSize *
          0.94,
      ),
    );
  const watermarkHeight =
    Math.max(
      24,
      Math.round(
        qrSize *
          0.42,
      ),
    );

  const left =
    clamp(
      Math.round(
        qrLeft +
          (
            qrSize -
            watermarkWidth
          ) /
            2,
      ),
      0,
      Math.max(
        0,
        previewMeta.width -
          watermarkWidth,
      ),
    );
  const top =
    clamp(
      Math.round(
        qrTop +
          (
            qrSize -
            watermarkHeight
          ) /
            2,
      ),
      0,
      Math.max(
        0,
        previewMeta.height -
          watermarkHeight,
      ),
    );

  const fontSize =
    Math.max(
      16,
      Math.round(
        watermarkHeight *
          0.62,
      ),
    );

  const watermark =
    Buffer.from(
      `<svg width="${watermarkWidth}" height="${watermarkHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="100%" height="100%" fill="#ffffff" fill-opacity="0.94"/>
        <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
          fill="#000000" font-family="Arial, Helvetica, sans-serif"
          font-size="${fontSize}" font-weight="900" letter-spacing="1">CASA</text>
      </svg>`,
      "utf8",
    );

  return sharp(
    preview,
  )
    .composite([
      {
        input:
          watermark,
        left,
        top,
      },
    ])
    .png()
    .toBuffer();
}
