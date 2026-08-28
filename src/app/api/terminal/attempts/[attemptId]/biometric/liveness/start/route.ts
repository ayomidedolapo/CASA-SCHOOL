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
  AwsBiometricUnavailableError,
  startAwsVerificationLiveness,
} from "@/server/biometrics/aws-liveness";

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
    const result =
      await startAwsVerificationLiveness({
        access,
        attemptId,
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Face liveness could not be started.",
          code:
            result.code,
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
        liveness:
          result.session,
      },
      {
        status: 201,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
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
            attendanceNoStoreHeaders,
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
            attendanceNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}