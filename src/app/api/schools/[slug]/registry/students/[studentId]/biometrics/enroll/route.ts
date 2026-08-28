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
  InvalidBiometricCaptureError,
  readBiometricCapture,
} from "@/server/biometrics/capture";
import {
  enrollStudentBiometric,
} from "@/server/biometrics/enrollment";
import {
  BiometricProviderUnavailableError,
} from "@/server/biometrics/provider";

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

    const capture =
      await readBiometricCapture(
        request,
      );

    const result =
      await enrollStudentBiometric({
        access,
        studentId,
        capture,
        stepUpToken:
          request.headers.get(
            "x-casa-passkey-step-up",
          ),
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Biometric enrollment could not be completed.",
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
        profile:
          result.profile,
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
      InvalidBiometricCaptureError
    ) {
      return NextResponse.json(
        {
          message:
            error.message,
        },
        {
          status: 400,
        },
      );
    }

    if (
      error instanceof
      BiometricProviderUnavailableError
    ) {
      return NextResponse.json(
        {
          message:
            "Biometric provider is temporarily unavailable.",
          code:
            "BIOMETRIC_PROVIDER_UNAVAILABLE",
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
          "BIOMETRIC_PROVIDER_NOT_CONFIGURED" ||
        error.message ===
          "BIOMETRIC_PROVIDER_INVALID_CONFIGURATION" ||
        error.message ===
          "BIOMETRIC_PROVIDER_HTTPS_REQUIRED" ||
        error.message ===
          "BIOMETRIC_POLICY_NOT_CONFIGURED" ||
        error.message ===
          "BIOMETRIC_POLICY_INVALID"
      )
    ) {
      return NextResponse.json(
        {
          message:
            "Biometric service is not configured for use.",
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