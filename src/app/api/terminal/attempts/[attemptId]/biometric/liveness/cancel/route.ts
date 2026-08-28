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
  cancelAwsVerificationLiveness,
} from "@/server/biometrics/aws-liveness";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    attemptId: string;
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
  const access =
    await authenticateTerminalRequest(
      request,
    );

  if (!access) {
    return terminalUnauthorizedResponse();
  }

  const {
    attemptId,
  } =
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

  let raw: unknown;

  try {
    raw =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        message:
          "Invalid liveness cancellation request.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
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
          attendanceNoStoreHeaders,
      },
    );
  }

  try {
    const result =
      await cancelAwsVerificationLiveness({
        access,
        attemptId,
        livenessSessionId:
          body.data
            .livenessSessionId,
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Liveness session is no longer cancellable.",
          code:
            "LIVENESS_SESSION_UNAVAILABLE",
        },
        {
          status: 409,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        cancelled: true,
      },
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
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
            "AWS biometric mode is not active.",
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