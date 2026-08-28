import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  attendanceNoStoreHeaders,
  terminalUnauthorizedResponse,
} from "@/server/attendance/http";
import {
  authenticateTerminalRequest,
} from "@/server/attendance/terminal-auth";
import {
  InvalidBiometricCaptureError,
  readBiometricCapture,
} from "@/server/biometrics/capture";
import {
  BiometricProviderUnavailableError,
} from "@/server/biometrics/provider";
import {
  verifyAndFinalizeBiometricPresence,
} from "@/server/biometrics/verification";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    attemptId: string;
  }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const access =
    await authenticateTerminalRequest(
      request,
    );

  if (!access) {
    return terminalUnauthorizedResponse();
  }

  const { attemptId } =
    await context.params;

  if (
    !z.string()
      .uuid()
      .safeParse(
        attemptId,
      ).success
  ) {
    return NextResponse.json(
      {
        message:
          "Invalid verification attempt.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  try {
    const capture =
      await readBiometricCapture(
        request,
      );

    const result =
      await verifyAndFinalizeBiometricPresence({
        access,
        attemptId,
        capture,
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Biometric verification could not be accepted.",
          code:
            result.code,
          scores:
            "scores" in result
              ? result.scores
              : undefined,
        },
        {
          status:
            result.status,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        presence:
          result.presence,
        scores:
          result.scores,
      },
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
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
          headers:
            attendanceNoStoreHeaders,
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
          headers:
            attendanceNoStoreHeaders,
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
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}