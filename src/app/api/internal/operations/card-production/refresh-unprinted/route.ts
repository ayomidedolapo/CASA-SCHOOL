import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { refreshUnprintedCardsForTemplate } from "@/server/card-production/m38-lifecycle";
import { requireCasaCapability } from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

export const dynamic = "force-dynamic";

const bodySchema =
  z.object({
    schoolId:
      z.string()
        .uuid()
        .nullable()
        .optional(),
  });

function rowsOf<T>(
  result:
    unknown,
): T[] {
  if (
    Array.isArray(
      result,
    )
  ) {
    return result as T[];
  }

  if (
    result &&
    typeof result ===
      "object" &&
    "rows" in
      result &&
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

export async function POST(
  request:
    NextRequest,
) {
  try {
    await requireCasaCapability(
      "CARD_PRODUCTION_ADMIN",
    );

    const parsed =
      bodySchema.safeParse(
        await request
          .json()
          .catch(
            () => ({}),
          ),
      );

    if (
      !parsed.success
    ) {
      return NextResponse.json(
        {
          message:
            "Invalid unprinted-card refresh request.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const schoolId =
      parsed.data
        .schoolId ??
      null;

    const templates =
      rowsOf<{
        id: string;
        school_id:
          string;
      }>(
        await getDb()
          .execute(sql`
            select
              id::text,
              school_id::text
            from student_card_templates
            where
              status =
                'ACTIVE'::student_card_template_status
              and (
                ${schoolId}::uuid
                  is null
                or school_id =
                   ${schoolId}::uuid
              )
            order by
              activated_at desc
                nulls last,
              created_at desc
          `),
      );

    const totals = {
      templates:
        templates.length,
      total: 0,
      refreshed: 0,
      requeuedFromExported:
        0,
      skipped: 0,
      failed: 0,
    };

    for (
      const template of
      templates
    ) {
      const result =
        await refreshUnprintedCardsForTemplate({
          schoolId:
            template.school_id,
          templateId:
            template.id,
        });

      totals.total +=
        result.total;
      totals.refreshed +=
        result.refreshed;
      totals.requeuedFromExported +=
        result.requeuedFromExported;
      totals.skipped +=
        result.skipped;
      totals.failed +=
        result.failed;
    }

    return NextResponse.json(
      {
        ok:
          totals.failed ===
          0,
        ...totals,
      },
      {
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      casaInternalAuthErrorResponse(
        error,
      );
    if (response) {
      return response;
    }

    throw error;
  }
}
