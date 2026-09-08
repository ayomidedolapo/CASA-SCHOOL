import {
  and,
  asc,
  desc,
  eq,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  attendancePolicies,
  attendancePolicyDays,
} from "@/db/schema";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";

export interface AttendancePolicyDayInput {
  weekday: number;
  checkInOpensAt: string;
  onTimeUntil: string;
  checkInClosesAt: string;
  normalDismissalAt: string;
  checkOutClosesAt: string;
}

export function firstAttendanceDbRow<T>(
  result: unknown,
): T | null {
  if (Array.isArray(result)) {
    return (
      (result[0] as T | undefined) ??
      null
    );
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result
  ) {
    const rows =
      (
        result as {
          rows?: unknown;
        }
      ).rows;

    if (Array.isArray(rows)) {
      return (
        (rows[0] as T | undefined) ??
        null
      );
    }
  }

  return null;
}

export function attendanceDbRows<T>(
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result
  ) {
    const rows =
      (
        result as {
          rows?: unknown;
        }
      ).rows;

    if (Array.isArray(rows)) {
      return rows as T[];
    }
  }

  return [];
}

export async function listAttendancePolicies(
  schoolId: string,
) {
  const db = getDb();

  const [
    policies,
    days,
  ] =
    await db.batch([
      db
        .select({
          id:
            attendancePolicies.id,
          name:
            attendancePolicies.name,
          isDefault:
            attendancePolicies.isDefault,
          isActive:
            attendancePolicies.isActive,
          validFrom:
            attendancePolicies.validFrom,
          validTo:
            attendancePolicies.validTo,
          createdAt:
            attendancePolicies.createdAt,
        })
        .from(
          attendancePolicies,
        )
        .where(
          eq(
            attendancePolicies.schoolId,
            schoolId,
          ),
        )
        .orderBy(
          desc(
            attendancePolicies.createdAt,
          ),
        ),
      db
        .select({
          policyId:
            attendancePolicyDays.policyId,
          weekday:
            attendancePolicyDays.weekday,
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
          eq(
            attendancePolicyDays.schoolId,
            schoolId,
          ),
        )
        .orderBy(
          asc(
            attendancePolicyDays.weekday,
          ),
        ),
    ]);

  const graceRows =
    attendanceDbRows<{
      id: string;
      school_bus_grace_minutes:
        number;
      independent_grace_minutes:
        number;
    }>(
      await db.execute(sql`
        select
          id,
          school_bus_grace_minutes,
          independent_grace_minutes
        from attendance_policies
        where school_id =
          ${schoolId}::uuid
      `),
    );

  const graceByPolicy =
    new Map(
      graceRows.map(
        (row) => [
          row.id,
          row,
        ] as const,
      ),
    );

  return policies.map(
    (policy) => ({
      ...policy,
      schoolBusGraceMinutes:
        graceByPolicy.get(
          policy.id,
        )?.school_bus_grace_minutes ??
        0,
      independentGraceMinutes:
        graceByPolicy.get(
          policy.id,
        )?.independent_grace_minutes ??
        0,
      days:
        days.filter(
          (day) =>
            day.policyId ===
            policy.id,
        ),
    }),
  );
}

export async function createAttendancePolicyVersion(
  input: {
    access:
      SchoolAccess;
    name: string;
    validFrom: string;
    validTo:
      string | null;
    isDefault:
      boolean;
    schoolBusGraceMinutes:
      number;
    independentGraceMinutes:
      number;
    days:
      AttendancePolicyDayInput[];
  },
) {
  const db = getDb();

  const daysJson =
    JSON.stringify(
      input.days.map(
        (day) => ({
          weekday:
            day.weekday,
          check_in_opens_at:
            day.checkInOpensAt,
          on_time_until:
            day.onTimeUntil,
          check_in_closes_at:
            day.checkInClosesAt,
          normal_dismissal_at:
            day.normalDismissalAt,
          check_out_closes_at:
            day.checkOutClosesAt,
        }),
      ),
    );

  const now =
    new Date().toISOString();

  const result =
    await db.execute(sql`
      with cleared_default as (
        update attendance_policies
        set
          is_default = false,
          updated_at =
            ${now}::timestamptz
        where
          school_id =
            ${input.access.school.id}::uuid
          and is_default = true
          and is_active = true
          and ${input.isDefault} = true
        returning id
      ),
      inserted_policy as (
        insert into attendance_policies (
          school_id,
          name,
          is_default,
          is_active,
          school_bus_grace_minutes,
          independent_grace_minutes,
          valid_from,
          valid_to,
          created_at,
          updated_at
        )
        select
${input.access.school.id}::uuid,
          ${input.name},
          ${input.isDefault},
          true,
          ${input.schoolBusGraceMinutes},
          ${input.independentGraceMinutes},
          ${input.validFrom}::date,
          ${input.validTo}::date,
          ${now}::timestamptz,
          ${now}::timestamptz

        from (

          select

            count(*)::int

              as cleared_count

          from

            cleared_default

        ) as default_clear_barrier

        returning
          id,
          school_id,
          name,
          is_default,
          is_active,
          school_bus_grace_minutes,
          independent_grace_minutes,
          valid_from,
          valid_to
      ),
      inserted_days as (
        insert into attendance_policy_days (
          school_id,
          policy_id,
          weekday,
          check_in_opens_at,
          on_time_until,
          check_in_closes_at,
          normal_dismissal_at,
          check_out_closes_at,
          created_at,
          updated_at
        )
        select
          inserted_policy.school_id,
          inserted_policy.id,
          d.weekday,
          d.check_in_opens_at::time,
          d.on_time_until::time,
          d.check_in_closes_at::time,
          d.normal_dismissal_at::time,
          d.check_out_closes_at::time,
          ${now}::timestamptz,
          ${now}::timestamptz
        from inserted_policy
        cross join jsonb_to_recordset(
          ${daysJson}::jsonb
        ) as d(
          weekday integer,
          check_in_opens_at text,
          on_time_until text,
          check_in_closes_at text,
          normal_dismissal_at text,
          check_out_closes_at text
        )
        returning id
      )
      select
        inserted_policy.id,
        inserted_policy.name,
        inserted_policy.is_default,
        inserted_policy.is_active,
        inserted_policy.school_bus_grace_minutes,
        inserted_policy.independent_grace_minutes,
        inserted_policy.valid_from,
        inserted_policy.valid_to,
        (
          select count(*)::int
          from inserted_days
        ) as day_count
      from inserted_policy
    `);

  const row =
    firstAttendanceDbRow<{
      id: string;
      name: string;
      is_default: boolean;
      is_active: boolean;
      school_bus_grace_minutes:
        number;
      independent_grace_minutes:
        number;
      valid_from: string | Date;
      valid_to:
        string | Date | null;
      day_count: number;
    }>(
      result,
    );

  if (!row) {
    throw new Error(
      "ATTENDANCE_POLICY_CREATE_FAILED",
    );
  }

  return row;
}

export async function resolveDefaultPolicyForDate(
  input: {
    schoolId: string;
    date: string;
    weekday: number;
  },
) {
  const db = getDb();

  const rows =
    await db
      .select({
        id:
          attendancePolicies.id,
        name:
          attendancePolicies.name,
        validFrom:
          attendancePolicies.validFrom,
        validTo:
          attendancePolicies.validTo,
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
        attendancePolicies,
      )
      .innerJoin(
        attendancePolicyDays,
        and(
          eq(
            attendancePolicyDays.schoolId,
            attendancePolicies.schoolId,
          ),
          eq(
            attendancePolicyDays.policyId,
            attendancePolicies.id,
          ),
        ),
      )
      .where(
        and(
          eq(
            attendancePolicies.schoolId,
            input.schoolId,
          ),
          eq(
            attendancePolicies.isDefault,
            true,
          ),
          eq(
            attendancePolicies.isActive,
            true,
          ),
          eq(
            attendancePolicyDays.weekday,
            input.weekday,
          ),
          sql`${attendancePolicies.validFrom} <= ${input.date}::date`,
          sql`(${attendancePolicies.validTo} is null or ${attendancePolicies.validTo} >= ${input.date}::date)`,
        ),
      )
      .limit(1);

  return rows[0] ?? null;
}