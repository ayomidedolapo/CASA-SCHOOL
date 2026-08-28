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

  return policies.map(
    (policy) => ({
      ...policy,
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
          valid_from,
          valid_to,
          created_at,
          updated_at
        )
        values (
          ${input.access.school.id}::uuid,
          ${input.name},
          ${input.isDefault},
          true,
          ${input.validFrom}::date,
          ${input.validTo}::date,
          ${now}::timestamptz,
          ${now}::timestamptz
        )
        returning
          id,
          school_id,
          name,
          is_default,
          is_active,
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
        inserted_policy.valid_from,
        inserted_policy.valid_to,
        (
          select count(*)::int
          from inserted_days
        ) as day_count
      from inserted_policy
    `);

  const row =
    Array.isArray(result)
      ? result[0]
      : null;

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