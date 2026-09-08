import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  cancelAwsEnrollmentLiveness,
} from "@/server/biometrics/aws-liveness";
import {
  requireCasaInternalOnboardingCapability,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    schoolId: string;
    studentId: string;
  }>;
}

const bodySchema =
  z.object({
    livenessSessionId:
      z.string().uuid(),
  });

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    schoolId,
    studentId,
  } =
    await context.params;

  try {
    const access =
      await requireCasaInternalOnboardingCapability(
        schoolId,
        "FACE_ENROLL",
      );

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      raw = null;
    }

    const body =
      bodySchema.safeParse(
        raw,
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid liveness cancellation request.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const result =
      await cancelAwsEnrollmentLiveness({
        access,
        studentId,
        livenessSessionId:
          body.data
            .livenessSessionId,
        actorScope:
          "CASA_INTERNAL",
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "The enrollment liveness session is no longer cancellable.",
          code:
            "LIVENESS_SESSION_NOT_CANCELLABLE",
        },
        {
          status: 409,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        cancelled:
          true,
      },
      {
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const authResponse =
      casaInternalAuthErrorResponse(
        error,
      );

    if (authResponse) {
      return authResponse;
    }

    if (
      error instanceof Error &&
      (
        error.message ===
          "BIOMETRIC_PROVIDER_MODE_NOT_CONFIGURED" ||
        error.message ===
          "BIOMETRIC_PROVIDER_MODE_MISMATCH"
      )
    ) {
      return NextResponse.json(
        {
          message:
            "AWS biometric engine is not configured.",
          code:
            error.message,
        },
        {
          status: 503,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}
