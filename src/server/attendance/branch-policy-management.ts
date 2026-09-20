import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type { SchoolAccess } from "@/server/auth/authorization";

export interface AttendancePolicyDayInput {
  weekday: number;
  checkInOpensAt: string;
  onTimeUntil: string;
  checkInClosesAt: string;
  normalDismissalAt: string;
  checkOutClosesAt: string;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export async function listBranchAttendancePolicies(
  schoolId: string,
  branchId: string,
) {
  const db = getDb();
  const result = await db.execute(sql`
    select
      p.id,
      p.name,
      p.is_default as "isDefault",
      p.is_active as "isActive",
      p.school_bus_grace_minutes as "schoolBusGraceMinutes",
      p.independent_grace_minutes as "independentGraceMinutes",
      p.valid_from as "validFrom",
      p.valid_to as "validTo",
      p.created_at as "createdAt",
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'weekday', d.weekday,
            'checkInOpensAt', d.check_in_opens_at,
            'onTimeUntil', d.on_time_until,
            'checkInClosesAt', d.check_in_closes_at,
            'normalDismissalAt', d.normal_dismissal_at,
            'checkOutClosesAt', d.check_out_closes_at
          ) order by d.weekday
        ) filter (where d.id is not null),
        '[]'::jsonb
      ) as days
    from attendance_policies p
    left join attendance_policy_days d
      on d.school_id = p.school_id
     and d.policy_id = p.id
    where p.school_id = ${schoolId}::uuid
      and p.branch_id = ${branchId}::uuid
    group by p.id
    order by p.created_at desc
  `);
  return rowsOf(result);
}

export async function createBranchAttendancePolicyVersion(input: {
  access: SchoolAccess;
  branchId: string;
  name: string;
  validFrom: string;
  validTo: string | null;
  isDefault: boolean;
  schoolBusGraceMinutes: number;
  independentGraceMinutes: number;
  days: AttendancePolicyDayInput[];
}) {
  const db = getDb();
  const daysJson = JSON.stringify(
    input.days.map((day) => ({
      weekday: day.weekday,
      check_in_opens_at: day.checkInOpensAt,
      on_time_until: day.onTimeUntil,
      check_in_closes_at: day.checkInClosesAt,
      normal_dismissal_at: day.normalDismissalAt,
      check_out_closes_at: day.checkOutClosesAt,
    })),
  );
  const now = new Date().toISOString();

  const result = await db.execute(sql`
    with cleared_default as (
      update attendance_policies
      set is_default = false, updated_at = ${now}::timestamptz
      where school_id = ${input.access.school.id}::uuid
        and branch_id = ${input.branchId}::uuid
        and is_default = true
        and is_active = true
        and ${input.isDefault} = true
      returning id
    ),
    inserted_policy as (
      insert into attendance_policies (
        school_id, branch_id, name, is_default, is_active,
        school_bus_grace_minutes, independent_grace_minutes,
        valid_from, valid_to, created_at, updated_at
      )
      select
        ${input.access.school.id}::uuid,
        ${input.branchId}::uuid,
        ${input.name},
        ${input.isDefault},
        true,
        ${input.schoolBusGraceMinutes},
        ${input.independentGraceMinutes},
        ${input.validFrom}::date,
        ${input.validTo}::date,
        ${now}::timestamptz,
        ${now}::timestamptz
      from (select count(*) from cleared_default) barrier
      returning *
    ),
    inserted_days as (
      insert into attendance_policy_days (
        school_id, policy_id, weekday, check_in_opens_at, on_time_until,
        check_in_closes_at, normal_dismissal_at, check_out_closes_at,
        created_at, updated_at
      )
      select
        p.school_id,
        p.id,
        d.weekday,
        d.check_in_opens_at::time,
        d.on_time_until::time,
        d.check_in_closes_at::time,
        d.normal_dismissal_at::time,
        d.check_out_closes_at::time,
        ${now}::timestamptz,
        ${now}::timestamptz
      from inserted_policy p
      cross join jsonb_to_recordset(${daysJson}::jsonb) as d(
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
      p.id,
      p.branch_id as "branchId",
      p.name,
      p.is_default as "isDefault",
      p.is_active as "isActive",
      p.school_bus_grace_minutes as "schoolBusGraceMinutes",
      p.independent_grace_minutes as "independentGraceMinutes",
      p.valid_from as "validFrom",
      p.valid_to as "validTo",
      (select count(*)::int from inserted_days) as "dayCount"
    from inserted_policy p
  `);

  const row = rowsOf(result)[0];
  if (!row) throw new Error("ATTENDANCE_POLICY_CREATE_FAILED");
  return row;
}

export async function resolveBranchDefaultPolicyForDate(input: {
  schoolId: string;
  branchId: string;
  date: string;
  weekday: number;
}) {
  const db = getDb();
  const result = await db.execute(sql`
    select
      p.id,
      p.name,
      p.valid_from as "validFrom",
      p.valid_to as "validTo",
      p.school_bus_grace_minutes as "schoolBusGraceMinutes",
      p.independent_grace_minutes as "independentGraceMinutes",
      d.check_in_opens_at as "checkInOpensAt",
      d.on_time_until as "onTimeUntil",
      d.check_in_closes_at as "checkInClosesAt",
      d.normal_dismissal_at as "normalDismissalAt",
      d.check_out_closes_at as "checkOutClosesAt"
    from attendance_policies p
    join attendance_policy_days d
      on d.school_id = p.school_id
     and d.policy_id = p.id
    where p.school_id = ${input.schoolId}::uuid
      and p.branch_id = ${input.branchId}::uuid
      and p.is_default = true
      and p.is_active = true
      and p.valid_from <= ${input.date}::date
      and (p.valid_to is null or p.valid_to >= ${input.date}::date)
      and d.weekday = ${input.weekday}
    order by p.valid_from desc, p.created_at desc
    limit 1
  `);
  return rowsOf<{
    id: string;
    name: string;
    validFrom: string;
    validTo: string | null;
    schoolBusGraceMinutes: number;
    independentGraceMinutes: number;
    checkInOpensAt: string;
    onTimeUntil: string;
    checkInClosesAt: string;
    normalDismissalAt: string;
    checkOutClosesAt: string;
  }>(result)[0] ?? null;
}

export async function resolveBranchDefaultPolicy(input: {
  schoolId: string;
  branchId: string;
  date: string;
}) {
  const db = getDb();
  const result = await db.execute(sql`
    select
      p.id,
      p.name,
      p.valid_from as "validFrom",
      p.valid_to as "validTo",
      p.school_bus_grace_minutes as "schoolBusGraceMinutes",
      p.independent_grace_minutes as "independentGraceMinutes"
    from attendance_policies p
    where p.school_id = ${input.schoolId}::uuid
      and p.branch_id = ${input.branchId}::uuid
      and p.is_default = true
      and p.is_active = true
      and p.valid_from <= ${input.date}::date
      and (p.valid_to is null or p.valid_to >= ${input.date}::date)
    order by p.valid_from desc, p.created_at desc
    limit 1
  `);
  return rowsOf<{
    id: string;
    name: string;
    validFrom: string;
    validTo: string | null;
    schoolBusGraceMinutes: number;
    independentGraceMinutes: number;
  }>(result)[0] ?? null;
}
