import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  completeInitialCardRollout,
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
import {
  emitCasaOperationalNotificationBestEffort,
} from "@/server/internal/operational-notifications";

export const dynamic =
  "force-dynamic";

const bodySchema =
  z.object({
    confirm:
      z.literal(
        true,
      ),
  });

export async function POST(
  request: NextRequest,
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
    const parsed =
      bodySchema.safeParse(
        await request
          .json()
          .catch(
            () => null,
          ),
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Explicit rollout-completion confirmation is required.",
        },
        {
          status:
            400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const result =
      await completeInitialCardRollout({
        schoolId,
        internalMembershipId:
          access.membership.id,
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            result.message,
          code:
            result.code,
          rollout:
            result.state,
          blockers:
            result.state?.blockers ??
            [],
        },
        {
          status:
            result.status,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    if (
      !result.alreadyCompleted
    ) {
      await writeCasaInternalAudit({
        access,
        schoolId,
        action:
          "INITIAL_CARD_ROLLOUT_COMPLETED",
        subjectType:
          "SCHOOL",
        subjectId:
          schoolId,
        metadata: {
          cutoffAt:
            result.state
              ?.completedAt ??
            null,
          activeStudents:
            result.state
              ?.activeStudents ??
            null,
          readyNowFirstCards:
            result.state
              ?.readyNowFirstCards ??
            null,
        },
      });

      await emitCasaOperationalNotificationBestEffort({
        event:
          "INITIAL_CARD_ROLLOUT_COMPLETED",
        scope: {
          kind:
            "SCHOOL",
          schoolId,
        },
        title:
          "Initial card rollout completed",
        body:
          "A CASA Super Admin confirmed the initial first-card rollout cutoff. Future students enrolled after this cutoff now follow the normal new-student batching policy.",
        actionUrl:
          `/internal/schools/${encodeURIComponent(
            schoolId,
          )}`,
        dedupKey:
          `initial-rollout-completed:${schoolId}`,
        dedupeSeconds:
          604800,
        payload: {
          rolloutState:
            result.state,
        },
      });
    }

    return NextResponse.json(
      {
        completed:
          true,
        alreadyCompleted:
          result.alreadyCompleted,
        rollout:
          result.state,
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
      "Initial card rollout completion failed",
      error,
    );

    return NextResponse.json(
      {
        message:
          "Initial card rollout completion failed.",
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
