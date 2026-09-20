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

export async function GET(
  _request: Request,
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

  if (
    !/^[0-9a-f-]{36}$/i.test(
      schoolId,
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
          branding.logo_object_key,
          branding.logo_content_type
        from schools school
        left join school_notification_branding branding
          on branding.school_id =
             school.id
        where school.id =
          ${schoolId}::uuid
        limit 1
      `);

  const row =
    rowsOf<{
      school_name: string;
      logo_object_key:
        string | null;
      logo_content_type:
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

  if (
    row.logo_object_key &&
    row.logo_content_type
  ) {
    const stored =
      await getPrivateCardObject(
        row.logo_object_key,
      );

    if (stored) {
      return new NextResponse(
        new Uint8Array(
          stored,
        ),
        {
          headers: {
            "Content-Type":
              row.logo_content_type,
            "Cache-Control":
              "public, max-age=3600, stale-while-revalidate=86400",
          },
        },
      );
    }
  }

  const initials =
    row.school_name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(
        (part) =>
          part[0]?.toUpperCase() ??
          "",
      )
      .join("") ||
    "CS";

  const svg =
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#0b0b0a"/><text x="256" y="292" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="176" font-weight="700" fill="#f2f2ef">${initials}</text></svg>`,
      "utf8",
    );

  const png =
    await sharp(svg)
      .png()
      .toBuffer();

  return new NextResponse(
    new Uint8Array(
      png,
    ),
    {
      headers: {
        "Content-Type":
          "image/png",
        "Cache-Control":
          "public, max-age=3600",
      },
    },
  );
}
