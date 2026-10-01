import {
  NextResponse,
} from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  reconcileInitialCardRollout,
} from "@/server/card-production/initial-rollout";
import {
  requireCasaSuperAdmin,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";
import {
  writeCasaInternalAudit,
} from "@/server/internal/onboarding";

export const dynamic =
  "force-dynamic";

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
      (result as {
        rows?: unknown;
      }).rows,
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
  _request: Request,
  context: {
    params: Promise<{
      schoolId: string;
    }>;
  },
) {
  try {
    const access =
      await requireCasaSuperAdmin();
    const {
      schoolId,
    } =
      await context.params;

    if (
      !z.string()
        .uuid()
        .safeParse(
          schoolId,
        )
        .success
    ) {
      return NextResponse.json(
        {
          message:
            "Invalid school.",
        },
        {
          status:
            400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const school =
      rowsOf<{
        timezone: string;
      }>(
        await getDb().execute(sql`
          select
            timezone
          from schools
          where
            id =
              ${schoolId}::uuid
            and status =
              'ACTIVE'::school_status
          limit 1
        `),
      )[0];

    if (!school) {
      return NextResponse.json(
        {
          message:
            "Active school not found.",
        },
        {
          status:
            404,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const reconciliation =
      await reconcileInitialCardRollout({
        schoolId,
        timezone:
          school.timezone,
        origin:
          "CASA_SUPER_ADMIN_INITIAL_ROLLOUT_RECONCILE",
        limit:
          25,
      });

    await writeCasaInternalAudit({
      access,
      schoolId,
      action:
        "INITIAL_CARD_ROLLOUT_RECONCILED",
      subjectType:
        "SCHOOL",
      subjectId:
        schoolId,
      metadata: {
        releasedScheduled:
          reconciliation.releasedScheduled,
        attempted:
          reconciliation.attempted,
        created:
          reconciliation.created,
        alreadyPresent:
          reconciliation.alreadyPresent,
        deferred:
          reconciliation.deferred,
        failed:
          reconciliation.failed,
        blockers:
          reconciliation.state
            ?.blockers ??
          [],
      },
    });

    return NextResponse.json(
      {
        reconciled:
          true,
        reconciliation,
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
      "Initial card rollout reconciliation failed",
      error,
    );

    return NextResponse.json(
      {
        message:
          "Initial card rollout reconciliation failed.",
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
