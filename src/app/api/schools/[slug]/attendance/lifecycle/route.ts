import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  attendanceAuthErrorResponse,
  attendanceNoStoreHeaders,
  requireAttendanceManager,
  requireAttendanceOperator,
} from "@/server/attendance/http";
import {
  activateAttendance,
  AttendanceReadinessError,
  getAttendanceLifecycle,
  markAttendanceReady,
  cancelScheduledAttendanceResume,
  pauseAttendance,
  resumeAttendance,
  scheduleAttendanceResume,
} from "@/server/attendance/readiness";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

const datePattern =
  /^\d{4}-\d{2}-\d{2}$/;

const mutationSchema =
  z.discriminatedUnion(
    "action",
    [
      z.object({
        action:
          z.literal(
            "MARK_READY",
          ),
        reason:
          z.string()
            .trim()
            .min(1)
            .max(240)
            .optional()
            .nullable(),
      }),
      z.object({
        action:
          z.literal(
            "ACTIVATE",
          ),
        effectiveDate:
          z.string()
            .regex(
              datePattern,
            )
            .optional()
            .nullable(),
        confirmStartToday:
          z.boolean()
            .optional()
            .default(false),
        reason:
          z.string()
            .trim()
            .min(1)
            .max(240)
            .optional()
            .nullable(),
      }),
      z.object({
        action:
          z.literal("PAUSE"),
        scheduledResumeAt:
          z.string()
            .datetime()
            .optional()
            .nullable(),
        reason:
          z.string()
            .trim()
            .min(1)
            .max(240)
            .optional()
            .nullable(),
      }),
      z.object({
        action:
          z.literal("RESUME"),
        reason:
          z.string()
            .trim()
            .min(1)
            .max(240)
            .optional()
            .nullable(),
      }),
      z.object({
        action:
          z.literal(
            "SCHEDULE_RESUME",
          ),
        scheduledResumeAt:
          z.string()
            .datetime(),
        reason:
          z.string()
            .trim()
            .min(1)
            .max(240)
            .optional()
            .nullable(),
      }),
      z.object({
        action:
          z.literal(
            "CANCEL_SCHEDULED_RESUME",
          ),
        reason:
          z.string()
            .trim()
            .min(1)
            .max(240)
            .optional()
            .nullable(),
      }),
    ],
  );

function domainErrorResponse(
  error: unknown,
) {
  if (
    error instanceof
      AttendanceReadinessError
  ) {
    return NextResponse.json(
      {
        message:
          error.message,
        code:
          error.code,
      },
      {
        status:
          error.status,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
  } = await context.params;

  try {
    const access =
      await requireAttendanceOperator(
        slug,
      );

    return NextResponse.json(
      {
        lifecycle:
          await getAttendanceLifecycle(
            access.school.id,
          ),
      },
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      attendanceAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    const domain =
      domainErrorResponse(
        error,
      );

    if (domain) {
      return domain;
    }

    throw error;
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
  } = await context.params;

  try {
    const access =
      await requireAttendanceManager(
        slug,
      );

    let body: unknown;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid attendance lifecycle request.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const parsed =
      mutationSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid attendance lifecycle request.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const result =
      parsed.data.action ===
        "MARK_READY"
        ? await markAttendanceReady({
            access,
            reason:
              parsed.data.reason ??
              null,
          })
        : parsed.data.action ===
            "ACTIVATE"
          ? await activateAttendance({
              access,
              effectiveDate:
                parsed.data
                  .effectiveDate ??
                null,
              confirmStartToday:
                parsed.data
                  .confirmStartToday,
              reason:
                parsed.data.reason ??
                null,
            })
          : parsed.data.action ===
              "PAUSE"
            ? await pauseAttendance({
                access,
                reason:
                  parsed.data.reason ??
                  null,
                scheduledResumeAt:
                  parsed.data
                    .scheduledResumeAt ??
                  null,
              })
            : parsed.data.action ===
                "RESUME"
              ? await resumeAttendance({
                  access,
                  reason:
                    parsed.data.reason ??
                    null,
                })
              : parsed.data.action ===
                  "SCHEDULE_RESUME"
                ? await scheduleAttendanceResume({
                    access,
                    scheduledResumeAt:
                      parsed.data
                        .scheduledResumeAt,
                    reason:
                      parsed.data.reason ??
                      null,
                  })
                : await cancelScheduledAttendanceResume({
                    access,
                    reason:
                      parsed.data.reason ??
                      null,
                  });

    return NextResponse.json(
      {
        lifecycle:
          result,
      },
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      attendanceAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    const domain =
      domainErrorResponse(
        error,
      );

    if (domain) {
      return domain;
    }

    throw error;
  }
}
