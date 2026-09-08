import { sql } from "drizzle-orm";

import { getDb } from "@/db";

export const STUDENT_ARRIVAL_METHODS = [
  "SCHOOL_BUS",
  "INDEPENDENT",
] as const;

export type StudentArrivalMethod =
  (typeof STUDENT_ARRIVAL_METHODS)[number];

export const PUNCTUALITY_OUTCOMES = [
  "ON_TIME",
  "ON_TIME_WITH_GRACE",
  "LATE",
] as const;

export type PunctualityOutcome =
  (typeof PUNCTUALITY_OUTCOMES)[number];

interface PunctualityPolicyRow {
  attendance_date: string;
  policy_id: string;
  official_start_time: string;
  school_bus_grace_minutes: number;
  independent_grace_minutes: number;
  arrival_method_assignment_id:
    string | null;
  arrival_method:
    StudentArrivalMethod;
  timezone: string;
}

export interface TransportPunctualitySnapshot {
  policyId: string;
  officialStartTime: string;
  actualArrivalAt: string;
  arrivalMethod:
    StudentArrivalMethod;
  arrivalMethodAssignmentId:
    string | null;
  graceMinutesUsed: number;
  minutesAfterOfficialStart: number;
  outcome: PunctualityOutcome;
}

function rowsOf<T>(
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(
      (
        result as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      result as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

function clockMinutes(
  value: string,
): number {
  const [
    hours,
    minutes,
  ] = value
    .slice(0, 5)
    .split(":")
    .map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(
      "ATTENDANCE_PUNCTUALITY_INVALID_CLOCK",
    );
  }

  return (
    hours * 60 +
    minutes
  );
}

function isoDateOrdinal(
  value: string,
): number {
  const [
    year,
    month,
    day,
  ] = value
    .slice(0, 10)
    .split("-")
    .map(Number);

  return Math.floor(
    Date.UTC(
      year,
      month - 1,
      day,
    ) /
      86400000,
  );
}

function localDateAndClock(
  date: Date,
  timezone: string,
): {
  date: string;
  clock: string;
} {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      },
    ).formatToParts(date);

  const part = (
    type: string,
  ) =>
    parts.find(
      (candidate) =>
        candidate.type === type,
    )?.value;

  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  const minute = part("minute");

  if (
    !year ||
    !month ||
    !day ||
    !hour ||
    !minute
  ) {
    throw new Error(
      "ATTENDANCE_PUNCTUALITY_TIMEZONE_RESOLUTION_FAILED",
    );
  }

  return {
    date:
      `${year}-${month}-${day}`,
    clock:
      `${hour}:${minute}`,
  };
}

export function calculateTransportPunctuality(
  input: {
    attendanceDate: string;
    officialStartTime: string;
    actualArrivalDate: string;
    actualArrivalClock: string;
    arrivalMethod:
      StudentArrivalMethod;
    schoolBusGraceMinutes: number;
    independentGraceMinutes:
      number;
  },
): {
  graceMinutesUsed: number;
  minutesAfterOfficialStart:
    number;
  outcome: PunctualityOutcome;
} {
  const official =
    clockMinutes(
      input.officialStartTime,
    );
  const actual =
    clockMinutes(
      input.actualArrivalClock,
    );

  const dayDelta =
    isoDateOrdinal(
      input.actualArrivalDate,
    ) -
    isoDateOrdinal(
      input.attendanceDate,
    );

  const rawMinutesAfter =
    dayDelta * 1440 +
    actual -
    official;

  const minutesAfterOfficialStart =
    Math.max(
      0,
      rawMinutesAfter,
    );

  const configuredGrace =
    input.arrivalMethod ===
      "SCHOOL_BUS"
      ? input.schoolBusGraceMinutes
      : input.independentGraceMinutes;

  const graceMinutesUsed =
    rawMinutesAfter > 0
      ? configuredGrace
      : 0;

  if (rawMinutesAfter <= 0) {
    return {
      graceMinutesUsed,
      minutesAfterOfficialStart,
      outcome: "ON_TIME",
    };
  }

  if (
    rawMinutesAfter <=
    configuredGrace
  ) {
    return {
      graceMinutesUsed,
      minutesAfterOfficialStart,
      outcome:
        "ON_TIME_WITH_GRACE",
    };
  }

  return {
    graceMinutesUsed,
    minutesAfterOfficialStart,
    outcome: "LATE",
  };
}

export async function resolveTransportPunctuality(
  input: {
    schoolId: string;
    studentId: string;
    sessionId: string;
    occurredAt: Date | string;
  },
): Promise<TransportPunctualitySnapshot> {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        session.attendance_date::text
          as attendance_date,
        policy.id
          as policy_id,
        day.on_time_until::text
          as official_start_time,
        policy.school_bus_grace_minutes,
        policy.independent_grace_minutes,
        assignment.id
          as arrival_method_assignment_id,
        coalesce(
          assignment.arrival_method,
          'INDEPENDENT'
        ) as arrival_method,
        school.timezone
      from attendance_sessions
        session
      join schools
        school
        on school.id =
           session.school_id
      join attendance_policies
        policy
        on policy.school_id =
           session.school_id
       and policy.id =
           session.policy_id
      join attendance_policy_days
        day
        on day.school_id =
           session.school_id
       and day.policy_id =
           session.policy_id
       and day.weekday =
           extract(
             dow
             from session.attendance_date
           )::int
      left join lateral (
        select
          item.id,
          item.arrival_method
        from student_arrival_method_assignments
          item
        where
          item.school_id =
            session.school_id
          and item.student_id =
            ${input.studentId}::uuid
          and item.effective_from <=
            session.attendance_date
          and (
            item.effective_to is null
            or item.effective_to >=
               session.attendance_date
          )
        order by
          item.effective_from desc,
          item.created_at desc
        limit 1
      ) assignment
        on true
      where
        session.school_id =
          ${input.schoolId}::uuid
        and session.id =
          ${input.sessionId}::uuid
      limit 1
    `);

  const row =
    rowsOf<PunctualityPolicyRow>(
      result,
    )[0];

  if (!row) {
    throw new Error(
      "ATTENDANCE_PUNCTUALITY_POLICY_REQUIRED",
    );
  }

  const occurredAt =
    input.occurredAt instanceof Date
      ? input.occurredAt
      : new Date(
          input.occurredAt,
        );

  if (
    Number.isNaN(
      occurredAt.getTime(),
    )
  ) {
    throw new Error(
      "ATTENDANCE_PUNCTUALITY_INVALID_ARRIVAL_TIME",
    );
  }

  const local =
    localDateAndClock(
      occurredAt,
      row.timezone,
    );

  const calculated =
    calculateTransportPunctuality({
      attendanceDate:
        row.attendance_date,
      officialStartTime:
        row.official_start_time,
      actualArrivalDate:
        local.date,
      actualArrivalClock:
        local.clock,
      arrivalMethod:
        row.arrival_method,
      schoolBusGraceMinutes:
        Number(
          row.school_bus_grace_minutes,
        ),
      independentGraceMinutes:
        Number(
          row.independent_grace_minutes,
        ),
    });

  return {
    policyId:
      row.policy_id,
    officialStartTime:
      row.official_start_time,
    actualArrivalAt:
      occurredAt.toISOString(),
    arrivalMethod:
      row.arrival_method,
    arrivalMethodAssignmentId:
      row.arrival_method_assignment_id,
    graceMinutesUsed:
      calculated.graceMinutesUsed,
    minutesAfterOfficialStart:
      calculated.minutesAfterOfficialStart,
    outcome:
      calculated.outcome,
  };
}
