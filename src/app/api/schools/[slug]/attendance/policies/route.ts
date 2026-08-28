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
  createAttendancePolicyVersion,
  listAttendancePolicies,
} from "@/server/attendance/policy-management";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

const timePattern =
  /^([01]\d|2[0-3]):[0-5]\d$/;

const daySchema =
  z.object({
    weekday:
      z.number()
        .int()
        .min(0)
        .max(6),
    checkInOpensAt:
      z.string()
        .regex(
          timePattern,
        ),
    onTimeUntil:
      z.string()
        .regex(
          timePattern,
        ),
    checkInClosesAt:
      z.string()
        .regex(
          timePattern,
        ),
    normalDismissalAt:
      z.string()
        .regex(
          timePattern,
        ),
    checkOutClosesAt:
      z.string()
        .regex(
          timePattern,
        ),
  })
  .superRefine(
    (
      value,
      context,
    ) => {
      if (
        !(
          value.checkInOpensAt <=
            value.onTimeUntil &&
          value.onTimeUntil <=
            value.checkInClosesAt &&
          value.checkInClosesAt <=
            value.normalDismissalAt &&
          value.normalDismissalAt <=
            value.checkOutClosesAt
        )
      ) {
        context.addIssue({
          code:
            "custom",
          message:
            "Attendance times must progress from check-in opening through dismissal close.",
        });
      }
    },
  );

const policySchema =
  z.object({
    name:
      z.string()
        .trim()
        .min(2)
        .max(120),
    validFrom:
      z.string()
        .regex(
          /^\d{4}-\d{2}-\d{2}$/,
        ),
    validTo:
      z.string()
        .regex(
          /^\d{4}-\d{2}-\d{2}$/,
        )
        .nullable()
        .optional(),
    isDefault:
      z.boolean()
        .default(true),
    days:
      z.array(
        daySchema,
      )
        .min(1)
        .max(7),
  })
  .superRefine(
    (
      value,
      context,
    ) => {
      if (
        value.validTo &&
        value.validTo <
          value.validFrom
      ) {
        context.addIssue({
          code:
            "custom",
          message:
            "Policy validTo cannot be before validFrom.",
        });
      }

      const weekdays =
        value.days.map(
          (day) =>
            day.weekday,
        );

      if (
        new Set(
          weekdays,
        ).size !==
        weekdays.length
      ) {
        context.addIssue({
          code:
            "custom",
          message:
            "Each weekday may appear only once.",
        });
      }
    },
  );

export async function GET(
  _request:
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
      await requireAttendanceOperator(
        slug,
      );

    const policies =
      await listAttendancePolicies(
        access.school.id,
      );

    return NextResponse.json(
      {
        policies,
      },
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
            "Invalid attendance policy request.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const parsed =
      policySchema.safeParse(
        raw,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid attendance policy.",
          issues:
            parsed.error.issues.map(
              (issue) => ({
                path:
                  issue.path.join(
                    ".",
                  ),
                message:
                  issue.message,
              }),
            ),
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const policy =
      await createAttendancePolicyVersion({
        access,
        name:
          parsed.data.name,
        validFrom:
          parsed.data.validFrom,
        validTo:
          parsed.data.validTo ??
          null,
        isDefault:
          parsed.data.isDefault,
        days:
          parsed.data.days,
      });

    return NextResponse.json(
      {
        policy,
      },
      {
        status: 201,
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