import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  verifyBiometricAssertionFromEnvironment,
} from "@/server/attendance/biometric-assertion";
import {
  finalizeVerifiedPresence,
} from "@/server/attendance/finalize-presence-dispatch";
import {
  attendanceNoStoreHeaders,
  terminalUnauthorizedResponse,
} from "@/server/attendance/http";
import {
  authenticateTerminalRequest,
} from "@/server/attendance/terminal-auth";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    attemptId: string;
  }>;
}

const finalizeSchema =
  z.object({
    biometricAssertion: z
      .string()
      .min(32)
      .max(4096),
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

  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        message:
          "Invalid biometric finalization request.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const parsed =
    finalizeSchema.safeParse(
      body,
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          "Invalid biometric finalization request.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  let assertion;

  try {
    assertion =
      verifyBiometricAssertionFromEnvironment(
        parsed.data
          .biometricAssertion,
      );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "BIOMETRIC_ASSERTION_NOT_CONFIGURED"
    ) {
      return NextResponse.json(
        {
          message:
            "Biometric verification service is not configured.",
          code:
            "BIOMETRIC_SERVICE_NOT_CONFIGURED",
        },
        {
          status: 503,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        message:
          "Trusted biometric evidence is invalid or expired.",
        code:
          "INVALID_BIOMETRIC_ASSERTION",
      },
      {
        status: 422,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const result =
    await finalizeVerifiedPresence(
      access,
      attemptId,
      assertion,
    );

  if (!result.ok) {
    return NextResponse.json(
      {
        message:
          result.message,
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
      presence: {
        operation:
          result.operation,
        attendanceRecordId:
          result.attendanceRecordId,
        presenceEventId:
          result.presenceEventId,
        notificationQueued:
          result.notificationQueued,
      },
      replayed:
        result.replayed,
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}