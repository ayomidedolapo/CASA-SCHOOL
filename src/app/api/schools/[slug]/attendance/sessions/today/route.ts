import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  attendanceAuthErrorResponse,
  attendanceNoStoreHeaders,
  requireAttendanceController,
} from "@/server/attendance/http";
import {
  closeTodayAttendanceSession,
  openTodayAttendanceSession,
  reopenTodayAttendanceSession,
} from "@/server/attendance/session-management";
import {
  requirePasskeyStepUpGrant,
} from "@/server/auth/passkey-step-up";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

const bodySchema =
  z.discriminatedUnion(
    "action",
    [
      z.object({
        action:
          z.literal(
            "OPEN",
          ),
      }),
      z.object({
        action:
          z.literal(
            "CLOSE",
          ),
      }),
      z.object({
        action:
          z.literal(
            "REOPEN",
          ),
        reason:
          z.string()
            .trim()
            .min(8)
            .max(240),
      }),
    ],
  );

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
      await requireAttendanceController(
        slug,
      );

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid attendance session request.",
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
            "Invalid attendance session action.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    let result;

    if (
      body.data.action ===
        "REOPEN"
    ) {
      await requirePasskeyStepUpGrant({
        token:
          request.headers.get(
            "x-casa-passkey-step-up",
          ),
        access,
        action:
          "ATTENDANCE_SESSION_REOPEN",
      });

      result =
        await reopenTodayAttendanceSession(
          access,
          body.data.reason,
        );
    } else {
      result =
        body.data.action ===
          "OPEN"
          ? await openTodayAttendanceSession(
              access,
            )
          : await closeTodayAttendanceSession(
              access,
            );
    }

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Attendance session action could not be completed.",
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
    if (
      error instanceof Error &&
      error.message ===
        "PASSKEY_STEP_UP_REQUIRED"
    ) {
      return NextResponse.json(
        {
          message:
            "Passkey authorization is required to reopen attendance.",
          code:
            "PASSKEY_STEP_UP_REQUIRED",
          requiredAction:
            "ATTENDANCE_SESSION_REOPEN",
        },
        {
          status: 403,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

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