import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  consumePasskeyStepUpGrantWithId,
} from "@/server/auth/passkey-step-up";

import {
  requireSchoolAccess,
} from "@/server/auth/authorization";
import {
  activateStudentCardHandover,
  CardHandoverError,
  requireStudentBranchCardAuthority,
} from "@/server/card-production/handover";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
    cardId: string;
  }>;
}

const bodySchema = z.object({
  confirmPhysicalHandover:
    z.literal(true),
  reason:
    z.string()
      .trim()
      .min(3)
      .max(240)
      .optional()
      .nullable(),
});

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
    cardId,
  } = await context.params;

  try {
    const access =
      await requireSchoolAccess(
        slug,
      );
    const authority =
      await requireStudentBranchCardAuthority({
        schoolSlug: slug,
        access,
        studentId,
      });

    const body =
      await request.json()
        .catch(() => null);
    const parsed =
      bodySchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Explicit physical handover confirmation is required.",
          code:
            "CARD_HANDOVER_CONFIRMATION_REQUIRED",
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const grantToken =
      request.headers.get(
        "x-casa-passkey-step-up",
      );
    const grantId =
      grantToken
        ? await consumePasskeyStepUpGrantWithId({
            token:
              grantToken,
            access:
              authority.access,
            action:
              "CARD_BULK_ACTIVATE",
          })
        : null;

    if (!grantId) {
      return NextResponse.json(
        {
          message:
            "Confirm card handover with your Passkey before activation.",
          code:
            "PASSKEY_STEP_UP_REQUIRED",
        },
        {
          status: 401,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const result =
      await activateStudentCardHandover({
        access:
          authority.access,
        branchId:
          authority.branch.id,
        studentId,
        cardId,
        reason:
          parsed.data.reason ??
          null,
      });

    return NextResponse.json(
      result,
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      schoolOperationsErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    if (
      error instanceof
      CardHandoverError
    ) {
      return NextResponse.json(
        {
          message:
            error.message,
          code:
            error.code,
        },
        {
          status:
            error.status,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}
