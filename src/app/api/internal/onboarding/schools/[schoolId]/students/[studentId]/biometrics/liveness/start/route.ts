import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  AwsBiometricUnavailableError,
  startAwsEnrollmentLiveness,
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

    const result =
      await startAwsEnrollmentLiveness({
        access,
        studentId,
        stepUpToken:
          request.headers.get(
            "x-casa-passkey-step-up",
          ),
        actorScope:
          "CASA_INTERNAL",
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Face enrollment liveness could not be started.",
          code:
            result.code,
          requiredAction:
            "requiredAction" in
              result
              ? result.requiredAction
              : undefined,
        },
        {
          status:
            result.status,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        action:
          result.action,
        liveness:
          result.session,
      },
      {
        status: 201,
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
      error instanceof
      AwsBiometricUnavailableError
    ) {
      return NextResponse.json(
        {
          message:
            "AWS biometric service is temporarily unavailable.",
          code:
            "AWS_BIOMETRIC_UNAVAILABLE",
        },
        {
          status: 503,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    if (
      error instanceof Error &&
      (
        error.message ===
          "BIOMETRIC_PROVIDER_MODE_NOT_CONFIGURED" ||
        error.message ===
          "BIOMETRIC_PROVIDER_MODE_MISMATCH" ||
        error.message ===
          "AWS_BIOMETRIC_NOT_CONFIGURED" ||
        error.message ===
          "AWS_BIOMETRIC_INVALID_QUALITY_FILTER"
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
