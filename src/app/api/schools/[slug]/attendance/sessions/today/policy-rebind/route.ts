import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  attendanceAuthErrorResponse,
  attendanceNoStoreHeaders,
  requireAttendanceManager,
} from "@/server/attendance/http";
import {
  consumePasskeyStepUpGrantWithId,
} from "@/server/auth/passkey-step-up";
import {
  rebindTodayAttendanceSessionPolicy,
} from "@/server/attendance/session-management";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

const bodySchema =
  z.object({
    reason:
      z.string()
        .trim()
        .min(8)
        .max(240),
  });

export async function POST(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const access =
      await requireAttendanceManager(
        slug,
      );

    const body =
      bodySchema.safeParse(
        await request
          .json()
          .catch(
            () => null,
          ),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Enter a policy correction reason between 8 and 240 characters.",
          code:
            "ATTENDANCE_SESSION_POLICY_REBIND_REASON_REQUIRED",
        },
        {
          status:
            400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const token =
      request.headers.get(
        "x-casa-passkey-step-up",
      );

    const passkeyGrantId =
      token
        ? await consumePasskeyStepUpGrantWithId({
            token,
            access,
            action:
              "ATTENDANCE_SESSION_POLICY_REBIND",
          })
        : null;

    if (!passkeyGrantId) {
      return NextResponse.json(
        {
          message:
            "Passkey authorization is required to use the current attendance policy for today's open session.",
          code:
            "PASSKEY_STEP_UP_REQUIRED",
          requiredAction:
            "ATTENDANCE_SESSION_POLICY_REBIND",
        },
        {
          status:
            403,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const result =
      await rebindTodayAttendanceSessionPolicy(
        access,
        body.data.reason,
        passkeyGrantId,
      );

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Today's attendance policy could not be corrected.",
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
      result,
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      attendanceAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}
