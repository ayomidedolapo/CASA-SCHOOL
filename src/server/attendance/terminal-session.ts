import {
  and,
  eq,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  attendancePolicyDays,
  attendanceSessions,
} from "@/db/schema";

const weekdayByShortName = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
} as const;

export interface SchoolClock {
  date: string;
  clock: string;
  weekday: number;
}

export function getSchoolClock(
  now: Date,
  timezone: string,
): SchoolClock {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        weekday: "short",
      },
    );

  const parts =
    Object.fromEntries(
      formatter
        .formatToParts(now)
        .filter(
          (part) =>
            part.type !== "literal",
        )
        .map(
          (part) => [
            part.type,
            part.value,
          ],
        ),
    );

  const weekday =
    weekdayByShortName[
      parts.weekday as
        keyof typeof weekdayByShortName
    ];

  if (
    weekday === undefined ||
    !parts.year ||
    !parts.month ||
    !parts.day ||
    !parts.hour ||
    !parts.minute
  ) {
    throw new Error(
      "Unable to resolve school-local time.",
    );
  }

  return {
    date:
      `${parts.year}-${parts.month}-${parts.day}`,
    clock:
      `${parts.hour}:${parts.minute}`,
    weekday,
  };
}

export async function getActiveTerminalSession(
  schoolId: string,
  timezone: string,
  now = new Date(),
) {
  const clock =
    getSchoolClock(
      now,
      timezone,
    );

  const db = getDb();

  const sessions =
    await db
      .select({
        id:
          attendanceSessions.id,
        policyId:
          attendanceSessions.policyId,
        attendanceDate:
          attendanceSessions.attendanceDate,
        status:
          attendanceSessions.status,
      })
      .from(attendanceSessions)
      .where(
        and(
          eq(
            attendanceSessions.schoolId,
            schoolId,
          ),
          eq(
            attendanceSessions.attendanceDate,
            clock.date,
          ),
          eq(
            attendanceSessions.status,
            "OPEN",
          ),
        ),
      )
      .limit(1);

  const session =
    sessions[0];

  if (!session) {
    return {
      clock,
      session: null,
      policyDay: null,
    };
  }

  const policyDays =
    await db
      .select({
        checkInOpensAt:
          attendancePolicyDays.checkInOpensAt,
        onTimeUntil:
          attendancePolicyDays.onTimeUntil,
        checkInClosesAt:
          attendancePolicyDays.checkInClosesAt,
        normalDismissalAt:
          attendancePolicyDays.normalDismissalAt,
        checkOutClosesAt:
          attendancePolicyDays.checkOutClosesAt,
      })
      .from(
        attendancePolicyDays,
      )
      .where(
        and(
          eq(
            attendancePolicyDays.schoolId,
            schoolId,
          ),
          eq(
            attendancePolicyDays.policyId,
            session.policyId,
          ),
          eq(
            attendancePolicyDays.weekday,
            clock.weekday,
          ),
        ),
      )
      .limit(1);

  return {
    clock,
    session,
    policyDay:
      policyDays[0] ?? null,
  };
}