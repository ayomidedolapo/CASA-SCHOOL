import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type { SchoolAccess } from "@/server/auth/authorization";
import { getAttendanceReadinessRejection, isInstructionalDate } from "./readiness";
import { getSchoolClock } from "./terminal-session";
import {
  resolveBranchDefaultPolicy,
  resolveBranchDefaultPolicyForDate,
} from "./branch-policy-management";

export type AttendanceBranchMode = "INSTRUCTIONAL" | "PRESENCE_ONLY";
export type AttendanceBranchStatus = "PLANNED" | "OPEN" | "CLOSED" | "CANCELLED";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

async function resolvePolicyForMode(input: {
  schoolId: string;
  branchId: string;
  date: string;
  weekday: number;
  mode: AttendanceBranchMode;
}) {
  if (input.mode === "INSTRUCTIONAL") {
    return resolveBranchDefaultPolicyForDate(input);
  }
  return resolveBranchDefaultPolicy(input);
}

export async function getBranchAttendanceContext(input: {
  schoolId: string;
  branchId: string;
  timezone: string;
  now?: Date;
}) {
  const clock = getSchoolClock(input.now ?? new Date(), input.timezone);
  const db = getDb();
  const row = rowsOf<{
    session_id: string;
    attendance_date: string;
    branch_session_id: string | null;
    branch_status: AttendanceBranchStatus | null;
    branch_mode: AttendanceBranchMode | null;
    policy_id: string | null;
    opened_at: string | Date | null;
    closed_at: string | Date | null;
    check_in_opens_at: string | null;
    on_time_until: string | null;
    check_in_closes_at: string | null;
    normal_dismissal_at: string | null;
    check_out_closes_at: string | null;
  }>(await db.execute(sql`
    select
      s.id::text as session_id,
      s.attendance_date::text as attendance_date,
      bs.id::text as branch_session_id,
      bs.status as branch_status,
      bs.mode as branch_mode,
      bs.policy_id::text as policy_id,
      bs.opened_at,
      bs.closed_at,
      d.check_in_opens_at::text,
      d.on_time_until::text,
      d.check_in_closes_at::text,
      d.normal_dismissal_at::text,
      d.check_out_closes_at::text
    from attendance_sessions s
    left join attendance_branch_sessions bs
      on bs.school_id = s.school_id
     and bs.session_id = s.id
     and bs.branch_id = ${input.branchId}::uuid
    left join attendance_policy_days d
      on d.school_id = s.school_id
     and d.policy_id = bs.policy_id
     and d.weekday = ${clock.weekday}
    where s.school_id = ${input.schoolId}::uuid
      and s.attendance_date = ${clock.date}::date
    limit 1
  `))[0];

  return {
    clock,
    session: row
      ? {
          id: row.session_id,
          attendanceDate: row.attendance_date,
          branchSessionId: row.branch_session_id,
          branchId: input.branchId,
          status: row.branch_status,
          mode: (row.branch_mode ?? "INSTRUCTIONAL") as AttendanceBranchMode,
          policyId: row.policy_id,
          openedAt: row.opened_at,
          closedAt: row.closed_at,
        }
      : null,
    policyDay:
      row?.check_in_opens_at &&
      row.on_time_until &&
      row.check_in_closes_at &&
      row.normal_dismissal_at &&
      row.check_out_closes_at
        ? {
            checkInOpensAt: row.check_in_opens_at,
            onTimeUntil: row.on_time_until,
            checkInClosesAt: row.check_in_closes_at,
            normalDismissalAt: row.normal_dismissal_at,
            checkOutClosesAt: row.check_out_closes_at,
          }
        : null,
  };
}

export async function prepareBranchAttendanceSession(input: {
  access: SchoolAccess;
  branchId: string;
  mode: AttendanceBranchMode;
}) {
  const { access, branchId, mode } = input;
  const clock = getSchoolClock(new Date(), access.school.timezone);

  // Do not let a PREPARE retry reopen or otherwise mutate a campus session
  // that has already moved beyond its pre-open state.
  const existing = await getBranchAttendanceContext({
    schoolId: access.school.id,
    branchId,
    timezone: access.school.timezone,
  });
  if (existing.session?.branchSessionId) {
    if (existing.session.status === "OPEN") {
      return { ok: false as const, status: 409 as const, code: "ATTENDANCE_SESSION_ALREADY_OPEN" as const };
    }
    if (existing.session.status === "CLOSED" || existing.session.status === "CANCELLED") {
      return { ok: false as const, status: 409 as const, code: "ATTENDANCE_SESSION_ALREADY_FINISHED" as const };
    }
  }

  const readiness = await getAttendanceReadinessRejection({
    schoolId: access.school.id,
    date: clock.date,
  });
  if (readiness) {
    return { ok: false as const, status: readiness.status, code: readiness.code };
  }

  if (
    mode === "INSTRUCTIONAL" &&
    !(await isInstructionalDate({ schoolId: access.school.id, date: clock.date, branchId }))
  ) {
    return { ok: false as const, status: 409 as const, code: "NON_INSTRUCTIONAL_DAY" as const };
  }

  const policy = await resolvePolicyForMode({
    schoolId: access.school.id,
    branchId,
    date: clock.date,
    weekday: clock.weekday,
    mode,
  });
  if (!policy) {
    return { ok: false as const, status: 409 as const, code: "ATTENDANCE_POLICY_REQUIRED" as const };
  }

  const db = getDb();
  const now = new Date().toISOString();
  const row = rowsOf<{
    session_id: string;
    branch_session_id: string;
    status: AttendanceBranchStatus;
    mode: AttendanceBranchMode;
  }>(await db.execute(sql`
    with day_session as (
      insert into attendance_sessions (
        school_id, policy_id, attendance_date, status, opened_at, closed_at, created_at, updated_at
      ) values (
        ${access.school.id}::uuid,
        ${policy.id}::uuid,
        ${clock.date}::date,
        'PLANNED'::attendance_session_status,
        null,
        null,
        ${now}::timestamptz,
        ${now}::timestamptz
      )
      on conflict (school_id, attendance_date)
      do update set
        status = case
          when attendance_sessions.status = 'CLOSED'::attendance_session_status
            then 'OPEN'::attendance_session_status
          else attendance_sessions.status
        end,
        closed_at = case
          when attendance_sessions.status = 'CLOSED'::attendance_session_status then null
          else attendance_sessions.closed_at
        end,
        updated_at = ${now}::timestamptz
      where attendance_sessions.status <> 'CANCELLED'::attendance_session_status
      returning id
    ),
    campus as (
      insert into attendance_branch_sessions (
        school_id, session_id, branch_id, policy_id, status, mode,
        opened_at, closed_at, created_at, updated_at
      )
      select
        ${access.school.id}::uuid,
        day_session.id,
        ${branchId}::uuid,
        ${policy.id}::uuid,
        'PLANNED',
        ${mode},
        null,
        null,
        ${now}::timestamptz,
        ${now}::timestamptz
      from day_session
      on conflict (school_id, session_id, branch_id)
      do update set
        policy_id = case
          when attendance_branch_sessions.status = 'PLANNED' then excluded.policy_id
          else attendance_branch_sessions.policy_id
        end,
        mode = case
          when attendance_branch_sessions.status = 'PLANNED' then excluded.mode
          else attendance_branch_sessions.mode
        end,
        updated_at = ${now}::timestamptz
      returning id, session_id, status, mode
    )
    select session_id::text, id::text as branch_session_id, status, mode from campus
  `))[0];

  if (!row) {
    return { ok: false as const, status: 409 as const, code: "ATTENDANCE_SESSION_CANCELLED" as const };
  }
  if (row.status !== "PLANNED") {
    return {
      ok: false as const,
      status: 409 as const,
      code: row.status === "OPEN" ? "ATTENDANCE_SESSION_ALREADY_OPEN" as const : "ATTENDANCE_SESSION_ALREADY_FINISHED" as const,
    };
  }

  return {
    ok: true as const,
    clock,
    policy,
    session: {
      id: row.session_id,
      branchSessionId: row.branch_session_id,
      branchId,
      status: "PLANNED" as const,
      mode: row.mode,
    },
  };
}

export async function openBranchAttendanceSession(input: {
  access: SchoolAccess;
  branchId: string;
}) {
  const { access, branchId } = input;
  let context = await getBranchAttendanceContext({
    schoolId: access.school.id,
    branchId,
    timezone: access.school.timezone,
  });

  if (!context.session?.branchSessionId) {
    const prepared = await prepareBranchAttendanceSession({
      access,
      branchId,
      mode: "INSTRUCTIONAL",
    });
    if (!prepared.ok) return prepared;
    context = await getBranchAttendanceContext({
      schoolId: access.school.id,
      branchId,
      timezone: access.school.timezone,
    });
  }

  if (!context.session?.branchSessionId) {
    throw new Error("ATTENDANCE_BRANCH_SESSION_PREPARE_FAILED");
  }
  if (context.session.status === "OPEN") {
    return {
      ok: true as const,
      clock: context.clock,
      policy: null,
      session: {
        id: context.session.id,
        branchSessionId: context.session.branchSessionId,
        branchId,
        status: "OPEN" as const,
        mode: context.session.mode,
      },
    };
  }
  if (context.session.status !== "PLANNED") {
    return { ok: false as const, status: 409 as const, code: "ATTENDANCE_SESSION_ALREADY_FINISHED" as const };
  }

  if (
    context.session.mode === "INSTRUCTIONAL" &&
    !(await isInstructionalDate({ schoolId: access.school.id, date: context.clock.date, branchId }))
  ) {
    return { ok: false as const, status: 409 as const, code: "NON_INSTRUCTIONAL_DAY" as const };
  }

  const readiness = await getAttendanceReadinessRejection({
    schoolId: access.school.id,
    date: context.clock.date,
  });
  if (readiness) {
    return { ok: false as const, status: readiness.status, code: readiness.code };
  }

  const db = getDb();
  const now = new Date().toISOString();
  const row = rowsOf<{
    session_id: string;
    branch_session_id: string;
    mode: AttendanceBranchMode;
  }>(await db.execute(sql`
    with opened as (
      update attendance_branch_sessions bs
      set
        status = 'OPEN',
        opened_at = ${now}::timestamptz,
        closed_at = null,
        opened_by_membership_id = ${access.membership.id}::uuid,
        updated_at = ${now}::timestamptz
      where bs.school_id = ${access.school.id}::uuid
        and bs.id = ${context.session.branchSessionId}::uuid
        and bs.status = 'PLANNED'
      returning bs.id, bs.session_id, bs.mode
    ),
    sync_day as (
      update attendance_sessions s
      set
        status = 'OPEN'::attendance_session_status,
        opened_at = coalesce(s.opened_at, ${now}::timestamptz),
        closed_at = null,
        updated_at = ${now}::timestamptz
      where s.school_id = ${access.school.id}::uuid
        and s.id = (select session_id from opened)
      returning s.id
    )
    select opened.session_id::text, opened.id::text as branch_session_id, opened.mode
    from opened
    where exists (select 1 from sync_day)
  `))[0];

  if (!row) {
    return { ok: false as const, status: 409 as const, code: "ATTENDANCE_SESSION_NOT_PLANNED" as const };
  }
  return {
    ok: true as const,
    clock: context.clock,
    policy: null,
    session: {
      id: row.session_id,
      branchSessionId: row.branch_session_id,
      branchId,
      status: "OPEN" as const,
      mode: row.mode,
    },
  };
}

export async function closeBranchAttendanceSession(input: { access: SchoolAccess; branchId: string }) {
  const clock = getSchoolClock(new Date(), input.access.school.timezone);
  const db = getDb();
  const now = new Date().toISOString();
  const row = rowsOf<{ session_id: string; branch_session_id: string; status: string }>(await db.execute(sql`
    with target as (
      select s.id as session_id, bs.id as branch_session_id, bs.status
      from attendance_sessions s
      join attendance_branch_sessions bs
        on bs.school_id = s.school_id and bs.session_id = s.id
      where s.school_id = ${input.access.school.id}::uuid
        and s.attendance_date = ${clock.date}::date
        and bs.branch_id = ${input.branchId}::uuid
      limit 1
    ), closed as (
      update attendance_branch_sessions bs
      set status = 'CLOSED', closed_at = ${now}::timestamptz,
          closed_by_membership_id = ${input.access.membership.id}::uuid,
          updated_at = ${now}::timestamptz
      from target
      where bs.id = target.branch_session_id and target.status = 'OPEN'
      returning bs.id, bs.session_id, bs.status
    ), aggregate as (
      select
        s.id,
        exists(select 1 from attendance_branch_sessions x where x.school_id=s.school_id and x.session_id=s.id and x.status='OPEN') as has_open,
        exists(select 1 from attendance_branch_sessions x where x.school_id=s.school_id and x.session_id=s.id and x.status='PLANNED') as has_planned,
        exists(select 1 from attendance_branch_sessions x where x.school_id=s.school_id and x.session_id=s.id and x.status='CLOSED') as has_closed
      from attendance_sessions s
      where s.id = (select session_id from closed)
    ), sync_day as (
      update attendance_sessions s
      set
        status = case
          when aggregate.has_open or aggregate.has_planned then 'OPEN'::attendance_session_status
          when aggregate.has_closed then 'CLOSED'::attendance_session_status
          else 'CANCELLED'::attendance_session_status
        end,
        opened_at = case
          when aggregate.has_open or aggregate.has_planned or aggregate.has_closed
            then coalesce(s.opened_at, ${now}::timestamptz)
          else s.opened_at
        end,
        closed_at = case
          when not aggregate.has_open and not aggregate.has_planned and aggregate.has_closed
            then ${now}::timestamptz
          else null
        end,
        updated_at = ${now}::timestamptz
      from aggregate
      where s.id = aggregate.id
      returning s.id
    )
    select target.session_id::text, target.branch_session_id::text, coalesce(closed.status, target.status) as status
    from target left join closed on closed.id = target.branch_session_id
  `))[0];
  if (!row) return { ok: false as const, status: 404 as const, code: "ATTENDANCE_SESSION_NOT_FOUND" as const };
  if (row.status === "CLOSED") return { ok: true as const, session: { id: row.session_id, branchSessionId: row.branch_session_id, status: "CLOSED" as const } };
  return { ok: false as const, status: 409 as const, code: "ATTENDANCE_SESSION_NOT_OPEN" as const };
}

export async function reopenBranchAttendanceSession(input: { access: SchoolAccess; branchId: string; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 240) {
    return { ok: false as const, status: 400 as const, code: "ATTENDANCE_SESSION_REOPEN_REASON_REQUIRED" as const };
  }
  const clock = getSchoolClock(new Date(), input.access.school.timezone);
  const db = getDb();
  const now = new Date().toISOString();
  const row = rowsOf<{ session_id: string; branch_session_id: string; mode: AttendanceBranchMode }>(await db.execute(sql`
    with target as (
      select s.id as session_id, bs.id as branch_session_id
      from attendance_sessions s join attendance_branch_sessions bs
        on bs.school_id = s.school_id and bs.session_id = s.id
      where s.school_id = ${input.access.school.id}::uuid
        and s.attendance_date = ${clock.date}::date
        and bs.branch_id = ${input.branchId}::uuid
        and bs.status = 'CLOSED'
      limit 1
    ), reopened as (
      update attendance_branch_sessions bs
      set status = 'OPEN', closed_at = null,
          reopened_by_membership_id = ${input.access.membership.id}::uuid,
          last_reason = ${reason}, updated_at = ${now}::timestamptz
      from target where bs.id = target.branch_session_id
      returning bs.id, bs.session_id, bs.mode
    ), sync_day as (
      update attendance_sessions s
      set status = 'OPEN'::attendance_session_status,
          opened_at = coalesce(s.opened_at, ${now}::timestamptz),
          closed_at = null,
          updated_at = ${now}::timestamptz
      where s.id = (select session_id from target)
      returning s.id
    )
    select session_id::text, id::text as branch_session_id, mode from reopened
  `))[0];
  if (!row) return { ok: false as const, status: 409 as const, code: "ATTENDANCE_SESSION_NOT_CLOSED" as const };
  return { ok: true as const, session: { id: row.session_id, branchSessionId: row.branch_session_id, status: "OPEN" as const, mode: row.mode } };
}

export async function rebindBranchAttendanceSessionPolicy(input: {
  access: SchoolAccess;
  branchId: string;
  reason: string;
  passkeyGrantId: string;
}) {
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 240) {
    return { ok: false as const, status: 400 as const, code: "ATTENDANCE_POLICY_REBIND_REASON_REQUIRED" as const };
  }

  const context = await getBranchAttendanceContext({
    schoolId: input.access.school.id,
    branchId: input.branchId,
    timezone: input.access.school.timezone,
  });
  if (
    !context.session?.branchSessionId ||
    (context.session.status !== "PLANNED" && context.session.status !== "OPEN")
  ) {
    return { ok: false as const, status: 409 as const, code: "ATTENDANCE_SESSION_NOT_PREPARABLE" as const };
  }

  const policy = await resolvePolicyForMode({
    schoolId: input.access.school.id,
    branchId: input.branchId,
    date: context.clock.date,
    weekday: context.clock.weekday,
    mode: context.session.mode,
  });
  if (!policy) {
    return { ok: false as const, status: 409 as const, code: "ATTENDANCE_POLICY_REQUIRED" as const };
  }

  const db = getDb();
  const now = new Date().toISOString();
  const row = rowsOf<{ id: string; session_id: string; status: "PLANNED" | "OPEN" }>(await db.execute(sql`
    update attendance_branch_sessions bs
    set policy_id = ${policy.id}::uuid,
        policy_rebound_by_membership_id = ${input.access.membership.id}::uuid,
        policy_rebind_passkey_grant_id = ${input.passkeyGrantId}::uuid,
        last_reason = ${reason},
        updated_at = ${now}::timestamptz
    where bs.school_id = ${input.access.school.id}::uuid
      and bs.id = ${context.session.branchSessionId}::uuid
      and bs.status in ('PLANNED','OPEN')
    returning bs.id::text, bs.session_id::text, bs.status
  `))[0];
  if (!row) {
    return { ok: false as const, status: 409 as const, code: "ATTENDANCE_SESSION_NOT_PREPARABLE" as const };
  }
  return {
    ok: true as const,
    policy,
    session: { id: row.session_id, branchSessionId: row.id, status: row.status },
  };
}

export async function getTerminalBranchAttendanceContext(input: {
  schoolId: string;
  terminalId: string;
  timezone: string;
  now?: Date;
}) {
  const db = getDb();
  const clock =
    getSchoolClock(
      input.now ??
        new Date(),
      input.timezone,
    );

  const terminalBranch =
    rowsOf<{
      branch_id:
        string;
      branch_name:
        string;
      branch_status:
        string;
    }>(
      await db.execute(sql`
        select
          b.id::text as branch_id,
          b.name as branch_name,
          b.status::text as branch_status
        from school_branch_terminals m
        join school_branches b
          on b.school_id =
             m.school_id
         and b.id =
             m.branch_id
        where
          m.school_id =
            ${input.schoolId}::uuid
          and m.terminal_id =
            ${input.terminalId}::uuid
        limit 1
      `),
    )[0];

  if (!terminalBranch) {
    return {
      branch:
        null,
      clock,
      session:
        null,
      policyDay:
        null,
    };
  }

  const context =
    await getBranchAttendanceContext({
      schoolId:
        input.schoolId,
      branchId:
        terminalBranch.branch_id,
      timezone:
        input.timezone,
      now:
        input.now,
    });

  return {
    branch: {
      id:
        terminalBranch.branch_id,
      name:
        terminalBranch.branch_name,
      status:
        terminalBranch.branch_status,
    },
    ...context,
  };
}

export type TerminalAttendanceReadinessCode =
  | "TERMINAL_BRANCH_UNASSIGNED"
  | "BRANCH_INACTIVE"
  | "ATTENDANCE_BRANCH_SESSION_NOT_PREPARED"
  | "ATTENDANCE_BRANCH_NOT_OPEN"
  | "ATTENDANCE_BRANCH_CLOSED"
  | "ATTENDANCE_POLICY_DAY_MISSING";

export function getTerminalAttendanceReadiness(
  context:
    Awaited<
      ReturnType<
        typeof getTerminalBranchAttendanceContext
      >
    >,
  options: {
    allowClosedForLateStay?:
      boolean;
  } = {},
): {
  code:
    TerminalAttendanceReadinessCode;
  message:
    string;
} | null {
  if (!context.branch) {
    return {
      code:
        "TERMINAL_BRANCH_UNASSIGNED",
      message:
        "This scanner is not assigned to a campus. Ask the School Technician to assign it to the correct campus.",
    };
  }

  if (
    context.branch.status !==
      "ACTIVE"
  ) {
    return {
      code:
        "BRANCH_INACTIVE",
      message:
        `${context.branch.name} is not an active campus, so this scanner cannot record attendance there.`,
    };
  }

  if (
    !context.session ||
    !context.session
      .branchSessionId
  ) {
    return {
      code:
        "ATTENDANCE_BRANCH_SESSION_NOT_PREPARED",
      message:
        `Attendance has not been prepared for ${context.branch.name} today.`,
    };
  }

  if (
    context.session.status ===
      "PLANNED"
  ) {
    return {
      code:
        "ATTENDANCE_BRANCH_NOT_OPEN",
      message:
        `Attendance is prepared for ${context.branch.name}, but it has not been opened yet. Use Open today on the Attendance page.`,
    };
  }

  if (
    context.session.status ===
      "CANCELLED" ||
    (
      context.session.status ===
        "CLOSED" &&
      options.allowClosedForLateStay !==
        true
    ) ||
    context.session.status ===
      null
  ) {
    return {
      code:
        "ATTENDANCE_BRANCH_CLOSED",
      message:
        `Attendance for ${context.branch.name} is closed right now.`,
    };
  }

  if (
    context.session.mode !==
      "PRESENCE_ONLY" &&
    !context.policyDay &&
    !(
      context.session.status ===
        "CLOSED" &&
      options.allowClosedForLateStay ===
        true
    )
  ) {
    return {
      code:
        "ATTENDANCE_POLICY_DAY_MISSING",
      message:
        `Attendance is open for ${context.branch.name}, but today's timetable is missing from the policy bound to this session. On Attendance, use Use current policy and try again.`,
    };
  }

  return null;
}

export async function findActiveLateStayAuthorization(input: {
  schoolId: string;
  sessionId: string;
  branchId: string;
  studentId: string;
  attendanceRecordId: string;
}) {
  const db = getDb();
  return rowsOf<{ id: string; authorized_by_membership_id: string }>(await db.execute(sql`
    select id::text, authorized_by_membership_id::text
    from attendance_late_stay_authorizations
    where school_id = ${input.schoolId}::uuid
      and session_id = ${input.sessionId}::uuid
      and branch_id = ${input.branchId}::uuid
      and student_id = ${input.studentId}::uuid
      and attendance_record_id = ${input.attendanceRecordId}::uuid
      and revoked_at is null and consumed_at is null
      and consumed_attempt_id is null
      and allowed_until >= now()
    order by created_at desc
    limit 1
  `))[0] ?? null;
}

export async function reserveLateStayAuthorization(input: {
  schoolId: string;
  authorizationId: string;
  attemptId: string;
}) {
  const db = getDb();
  const row = rowsOf<{ id: string }>(await db.execute(sql`
    update attendance_late_stay_authorizations
    set consumed_attempt_id = ${input.attemptId}::uuid, updated_at = now()
    where school_id = ${input.schoolId}::uuid
      and id = ${input.authorizationId}::uuid
      and consumed_at is null
      and consumed_attempt_id is null
      and revoked_at is null
      and allowed_until >= now()
    returning id::text
  `))[0];
  return Boolean(row);
}

export async function consumeLateStayAuthorizationForAttempt(input: {
  schoolId: string;
  attemptId: string;
}) {
  const db = getDb();
  await db.execute(sql`
    update attendance_late_stay_authorizations
    set consumed_at = now(), updated_at = now()
    where school_id = ${input.schoolId}::uuid
      and consumed_attempt_id = ${input.attemptId}::uuid
      and consumed_at is null
      and revoked_at is null
  `);
}
