import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  AwsBiometricUnavailableError,
  startAwsEnrollmentLiveness,
} from "@/server/biometrics/aws-liveness";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
  }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
  } =
    await context.params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
          "SCHOOL_TECHNICIAN",
        ],
      );

    const result =
      await startAwsEnrollmentLiveness({
        access,
        studentId,
        stepUpToken:
          request.headers.get(
            "x-casa-passkey-step-up",
          ),
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
          headers: {
            "Cache-Control":
              "no-store",
          },
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
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      AuthRequiredError
    ) {
      return NextResponse.json(
        {
          message:
            "Authentication required.",
        },
        {
          status: 401,
        },
      );
    }

    if (
      error instanceof
      SchoolAccessDeniedError
    ) {
      return NextResponse.json(
        {
          message:
            "Biometric enrollment access denied.",
        },
        {
          status: 403,
        },
      );
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
        },
      );
    }

    throw error;
  }
}