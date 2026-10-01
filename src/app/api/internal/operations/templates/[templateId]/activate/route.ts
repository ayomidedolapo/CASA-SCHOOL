import {
  NextResponse,
} from "next/server";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";

import {
  getDatabaseUrl,
} from "@/config/env";
import { getDb } from "@/db";
import {
  reconcileInitialCardRollout,
} from "@/server/card-production/initial-rollout";
import {
  refreshUnprintedCardsForTemplate,
} from "@/server/card-production/m38-lifecycle";
import {
  requireCasaCapability,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

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
      (result as { rows?: unknown }).rows,
    )
  ) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      templateId: string;
    }>;
  },
) {
  try {
    const access =
      await requireCasaCapability(
        "MASTER_TEMPLATE_ADMIN",
      );
    const {
      templateId,
    } =
      await context.params;
    const db = getDb();
    const target =
      rowsOf<{
        school_id: string;
        status: string;
        version_label: string;
        timezone: string;
      }>(
        await db.execute(sql`
          select
            template.school_id::text
              as school_id,
            template.status::text
              as status,
            template.version_label,
            school.timezone
          from student_card_templates
            template
          join schools school
            on school.id =
               template.school_id
          where
            template.id =
              ${templateId}::uuid
          limit 1
        `),
      )[0];

    if (!target) {
      return NextResponse.json(
        {
          message:
            "Template not found.",
        },
        {
          status:
            404,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    if (
      target.status ===
        "RETIRED"
    ) {
      return NextResponse.json(
        {
          message:
            "Retired template history cannot be reactivated. Edit the current design to publish a new revision.",
        },
        {
          status:
            409,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    if (
      target.status ===
        "ACTIVE"
    ) {
      return NextResponse.json(
        {
          activated:
            true,
          alreadyActive:
            true,
        },
        {
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const client =
      neon(
        getDatabaseUrl(),
      );
    const metadata =
      JSON.stringify({
        versionLabel:
          target.version_label,
      });

    await client.transaction([
      client`
        update student_card_templates
        set
          status =
            'RETIRED',
          activated_at =
            coalesce(
              activated_at,
              now()
            ),
          retired_at =
            now(),
          updated_at =
            now()
        where
          school_id =
            ${target.school_id}::uuid
          and status =
            'ACTIVE'
          and id <>
            ${templateId}::uuid
      `,
      client`
        update student_card_templates
        set
          status =
            'ACTIVE',
          activated_at =
            now(),
          retired_at =
            null,
          updated_at =
            now()
        where
          id =
            ${templateId}::uuid
          and status =
            'DRAFT'
      `,
      client`
        insert into casa_internal_audit_logs (
          actor_membership_id,
          school_id,
          action,
          subject_type,
          subject_id,
          metadata,
          created_at
        )
        values (
          ${access.membership.id}::uuid,
          ${target.school_id}::uuid,
          'MASTER_CARD_TEMPLATE_ACTIVATED',
          'CARD_TEMPLATE',
          ${templateId}::uuid,
          ${metadata}::jsonb,
          now()
        )
      `,
    ]);

    const propagation =
      await refreshUnprintedCardsForTemplate({
        schoolId:
          target.school_id,
        templateId,
      });

    let initialRollout:
      Awaited<
        ReturnType<
          typeof reconcileInitialCardRollout
        >
      > |
      null =
        null;

    try {
      initialRollout =
        await reconcileInitialCardRollout({
          schoolId:
            target.school_id,
          timezone:
            target.timezone,
          origin:
            new URL(
              request.url,
            ).origin,
          limit:
            10,
        });
    } catch (error) {
      console.error(
        "Initial rollout template backfill will retry in background",
        {
          schoolId:
            target.school_id,
          error:
            error instanceof
              Error
              ? error.message
              : String(
                  error,
                ),
        },
      );
    }

    return NextResponse.json(
      {
        activated:
          true,
        propagation,
        initialRollout,
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

    console.error(
      "Template activation failed",
      error,
    );

    return NextResponse.json(
      {
        message:
          "Template activation failed.",
      },
      {
        status:
          500,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  }
}
