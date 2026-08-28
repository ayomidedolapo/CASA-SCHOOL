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
  closeTodayAttendanceSession,
  openTodayAttendanceSession,
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
    action:
      z.enum([
        "OPEN",
        "CLOSE",
      ]),
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

    const result =
      body.data.action ===
        "OPEN"
        ? await openTodayAttendanceSession(
            access,
          )
        : await closeTodayAttendanceSession(
            access,
          );

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