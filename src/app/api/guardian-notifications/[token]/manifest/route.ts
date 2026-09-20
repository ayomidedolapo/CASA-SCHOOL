import {
  createHash,
} from "node:crypto";
import {
  sql,
} from "drizzle-orm";
import {
  NextResponse,
} from "next/server";

import {
  getDb,
} from "@/db";

export const dynamic =
  "force-dynamic";

function rowsOf<T>(
  value: unknown,
): T[] {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value as T[];
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "rows" in value &&
    Array.isArray(
      (
        value as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      value as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

export async function GET(
  _request: Request,
  context: {
    params:
      Promise<{
        token: string;
      }>;
  },
) {
  const {
    token,
  } =
    await context.params;

  const hash =
    createHash(
      "sha256",
    )
      .update(
        token,
        "utf8",
      )
      .digest(
        "hex",
      );

  const result =
    await getDb()
      .execute(sql`
        select
          school.name as school_name,
          school.id as school_id
        from guardian_push_enrollment_links link
        join schools school
          on school.id =
             link.school_id
        where
          link.token_hash =
            ${hash}
          and link.revoked_at is null
        limit 1
      `);

  const row =
    rowsOf<{
      school_name:
        string;
      school_id:
        string;
    }>(
      result,
    )[0];

  if (!row) {
    return new NextResponse(
      null,
      {
        status: 404,
      },
    );
  }

  const name =
    `${row.school_name} Notifications`;

  return NextResponse.json(
    {
      id:
        `/guardian-notifications/${encodeURIComponent(
          token,
        )}`,
      name,
      short_name:
        row.school_name
          .slice(
            0,
            22,
          ),
      description:
        `Trusted school attendance notifications from ${row.school_name}.`,
      start_url:
        `/guardian-notifications/${encodeURIComponent(
          token,
        )}`,
      scope:
        "/guardian-notifications/",
      display:
        "standalone",
      background_color:
        "#f2f2ef",
      theme_color:
        "#0b0b0a",
      icons: [
        {
          src:
            `/api/public/schools/${encodeURIComponent(
              row.school_id,
            )}/notification-logo`,
          sizes:
            "512x512",
          type:
            "image/png",
          purpose:
            "any maskable",
        },
      ],
    },
    {
      headers: {
        "Content-Type":
          "application/manifest+json",
        "Cache-Control":
          "no-store",
      },
    },
  );
}
