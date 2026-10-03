import {
  sql,
} from "drizzle-orm";
import {
  NextResponse,
} from "next/server";
import sharp from "sharp";

import {
  getDb,
} from "@/db";
import {
  getPrivateCardObject,
} from "@/server/card-production/storage";

export const dynamic =
  "force-dynamic";

// CASA_M52_ANDROID_NOTIFICATION_BRANDING
type NotificationLogoVariant =
  | "icon"
  | "badge";

function rowsOf<T>(
  value: unknown,
): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "rows" in value &&
    Array.isArray(
      (value as {
        rows?: unknown;
      }).rows,
    )
  ) {
    return (value as {
      rows: T[];
    }).rows;
  }

  return [];
}

function clamp01(
  value: number,
) {
  return Math.max(
    0,
    Math.min(
      1,
      value,
    ),
  );
}

async function notificationIcon(
  stored: Buffer,
) {
  return sharp(
    stored,
  )
    .rotate()
    .resize(
      192,
      192,
      {
        fit:
          "contain",
        background: {
          r: 0,
          g: 0,
          b: 0,
          alpha: 0,
        },
      },
    )
    .png()
    .toBuffer();
}

async function notificationBadge(
  stored: Buffer,
) {
  const rendered =
    await sharp(
      stored,
    )
      .rotate()
      .resize(
        96,
        96,
        {
          fit:
            "contain",
          background: {
            r: 0,
            g: 0,
            b: 0,
            alpha: 0,
          },
        },
      )
      .ensureAlpha()
      .raw()
      .toBuffer({
        resolveWithObject:
          true,
      });

  const {
    width,
    height,
    channels,
  } =
    rendered.info;

  const pixels =
    Buffer.from(
      rendered.data,
    );

  const cornerPoints = [
    [0, 0],
    [
      Math.max(
        0,
        width - 1,
      ),
      0,
    ],
    [
      0,
      Math.max(
        0,
        height - 1,
      ),
    ],
    [
      Math.max(
        0,
        width - 1,
      ),
      Math.max(
        0,
        height - 1,
      ),
    ],
  ] as const;

  const opaqueCorners:
    Array<
      [
        number,
        number,
        number,
      ]
    > =
      [];

  for (
    const [
      x,
      y,
    ] of cornerPoints
  ) {
    const offset =
      (
        y *
          width +
        x
      ) *
      channels;

    if (
      pixels[
        offset + 3
      ] >= 192
    ) {
      opaqueCorners.push([
        pixels[offset] ??
          255,
        pixels[
          offset + 1
        ] ??
          255,
        pixels[
          offset + 2
        ] ??
          255,
      ]);
    }
  }

  const background =
    opaqueCorners.length >
    0
      ? opaqueCorners
          .reduce(
            (
              total,
              pixel,
            ) => [
              total[0] +
                pixel[0],
              total[1] +
                pixel[1],
              total[2] +
                pixel[2],
            ],
            [
              0,
              0,
              0,
            ] as [
              number,
              number,
              number,
            ],
          )
          .map(
            (value) =>
              value /
              opaqueCorners.length,
          )
      : null;

  for (
    let offset = 0;
    offset <
    pixels.length;
    offset += channels
  ) {
    const sourceAlpha =
      pixels[
        offset + 3
      ] ??
      0;

    let maskAlpha =
      sourceAlpha;

    if (
      background &&
      sourceAlpha > 0
    ) {
      const red =
        pixels[offset] ??
        0;
      const green =
        pixels[
          offset + 1
        ] ??
        0;
      const blue =
        pixels[
          offset + 2
        ] ??
        0;

      const distance =
        Math.sqrt(
          (
            red -
            background[0]
          ) ** 2 +
          (
            green -
            background[1]
          ) ** 2 +
          (
            blue -
            background[2]
          ) ** 2,
        );

      maskAlpha =
        Math.round(
          sourceAlpha *
            clamp01(
              (
                distance -
                18
              ) /
                72,
            ),
        );
    }

    pixels[offset] =
      255;
    pixels[
      offset + 1
    ] =
      255;
    pixels[
      offset + 2
    ] =
      255;
    pixels[
      offset + 3
    ] =
      maskAlpha;
  }

  return sharp(
    pixels,
    {
      raw: {
        width,
        height,
        channels,
      },
    },
  )
    .png()
    .toBuffer();
}

function fallbackSvg(
  schoolName: string,
  variant:
    NotificationLogoVariant,
) {
  const initials =
    schoolName
      .split(
        /\s+/,
      )
      .filter(
        Boolean,
      )
      .slice(
        0,
        2,
      )
      .map(
        (part) =>
          part[0]
            ?.toUpperCase() ??
          "",
      )
      .join(
        "",
      ) ||
    "CS";

  return Buffer.from(
    variant ===
      "badge"
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="none"/><text x="48" y="63" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="45" font-weight="700" fill="#ffffff">${initials}</text></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" rx="30" fill="#0b0b0a"/><text x="96" y="119" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="70" font-weight="700" fill="#f2f2ef">${initials}</text></svg>`,
    "utf8",
  );
}

export async function GET(
  request: Request,
  context: {
    params:
      Promise<{
        schoolId: string;
      }>;
  },
) {
  const {
    schoolId,
  } =
    await context.params;

  const url =
    new URL(
      request.url,
    );
  const branchId =
    url.searchParams.get(
      "branchId",
    );
  const variant:
    NotificationLogoVariant =
      url.searchParams.get(
        "variant",
      ) ===
      "badge"
        ? "badge"
        : "icon";

  if (
    !/^[0-9a-f-]{36}$/i.test(
      schoolId,
    ) ||
    (
      branchId !==
        null &&
      !/^[0-9a-f-]{36}$/i.test(
        branchId,
      )
    )
  ) {
    return new NextResponse(
      null,
      { status: 404 },
    );
  }

  const result =
    await getDb()
      .execute(sql`
        select
          school.name as school_name,
          coalesce(
            branch_branding.logo_object_key,
            school_branding.logo_object_key
          ) as logo_object_key
        from schools school
        left join school_notification_branding school_branding
          on school_branding.school_id =
             school.id
        left join school_branch_notification_branding branch_branding
          on branch_branding.school_id =
             school.id
         and branch_branding.branch_id =
             ${branchId}::uuid
        where school.id =
          ${schoolId}::uuid
        limit 1
      `);

  const row =
    rowsOf<{
      school_name:
        string;
      logo_object_key:
        string | null;
    }>(
      result,
    )[0];

  if (!row) {
    return new NextResponse(
      null,
      { status: 404 },
    );
  }

  let png:
    Buffer | null =
      null;

  if (
    row.logo_object_key
  ) {
    const stored =
      await getPrivateCardObject(
        row.logo_object_key,
      );

    if (stored) {
      try {
        png =
          variant ===
            "badge"
            ? await notificationBadge(
                stored,
              )
            : await notificationIcon(
                stored,
              );
      } catch {
        png =
          null;
      }
    }
  }

  if (!png) {
    png =
      await sharp(
        fallbackSvg(
          row.school_name,
          variant,
        ),
      )
        .png()
        .toBuffer();
  }

  return new NextResponse(
    new Uint8Array(
      png,
    ),
    {
      headers: {
        "Content-Type":
          "image/png",
        "Cache-Control":
          "public, max-age=3600, stale-while-revalidate=86400",
        "X-CASA-Notification-Asset":
          variant,
      },
    },
  );
}
