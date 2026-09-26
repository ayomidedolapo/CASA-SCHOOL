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
  const branchId =
    new URL(
      request.url,
    ).searchParams.get(
      "branchId",
    );

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
          ) as logo_object_key,
          coalesce(
            branch_branding.logo_content_type,
            school_branding.logo_content_type
          ) as logo_content_type
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
