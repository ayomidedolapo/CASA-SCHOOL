import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  attendanceSessions,
} from "@/db/schema";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";

import {
  getSchoolClock,
} from "./terminal-session";
import {
  resolveDefaultPolicyForDate,
} from "./policy-management";

export async function openTodayAttendanceSession(
  access:
    SchoolAccess,
) {
  const clock =
    getSchoolClock(
      new Date(),
      access.school.timezone,
    );

  const policy =
    await resolveDefaultPolicyForDate({
      schoolId:
        access.school.id,
      date:
        clock.date,
      weekday:
        clock.weekday,
    });

  if (!policy) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTENDANCE_POLICY_REQUIRED",
    };
  }

  const db = getDb();

  const existingRows =
    await db
      .select({
        id:
          attendanceSessions.id,
        status:
          attendanceSessions.status,
      })
      .from(
        attendanceSessions,
      )
      .where(
        and(
          eq(
            attendanceSessions.schoolId,
            access.school.id,
          ),
          eq(
            attendanceSessions.attendanceDate,
            clock.date,
          ),
        ),
      )
      .limit(1);

  const existing =
    existingRows[0];

  if (
    existing &&
    (
      existing.status ===
        "CLOSED" ||
      existing.status ===
        "CANCELLED"
    )
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTENDANCE_SESSION_ALREADY_FINISHED",
    };
  }

  const now =
    new Date().toISOString();

  const result =
    await db.execute(sql`
      with opened as (
        insert into attendance_sessions (
          school_id,
          policy_id,
          attendance_date,
          status,
          opened_at,
          created_at,
          updated_at
        )
        values (
          ${access.school.id}::uuid,
          ${policy.id}::uuid,
          ${clock.date}::date,
          'OPEN'::attendance_session_status,
          ${now}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        )
        on conflict (
          school_id,
          attendance_date
        )
        do update set
          status =
            case
              when attendance_sessions.status =
                'PLANNED'::attendance_session_status
              then
                'OPEN'::attendance_session_status
              else
                attendance_sessions.status
            end,
          opened_at =
            case
              when attendance_sessions.status =
                'PLANNED'::attendance_session_status
              then
                ${now}::timestamptz
              else
                attendance_sessions.opened_at
            end,
          updated_at =
            ${now}::timestamptz
        returning
          id,
          school_id,
          policy_id,
          attendance_date,
          status,
          opened_at
      ),
      created_event as (
        insert into attendance_session_events (
          school_id,
          session_id,
          actor_membership_id,
          event_type,
          occurred_at,
          created_at
        )
        select
          opened.school_id,
          opened.id,
          ${access.membership.id}::uuid,
          'CREATED'::attendance_session_event_type,
          coalesce(
            opened.opened_at,
            ${now}::timestamptz
          ),
          ${now}::timestamptz
        from opened
        where
          opened.status =
            'OPEN'::attendance_session_status
        on conflict do nothing
        returning id
      ),
      opened_event as (
        insert into attendance_session_events (
          school_id,
          session_id,
          actor_membership_id,
          event_type,
          occurred_at,
          created_at
        )
        select
          opened.school_id,
          opened.id,
          ${access.membership.id}::uuid,
          'OPENED'::attendance_session_event_type,
          coalesce(
            opened.opened_at,
            ${now}::timestamptz
          ),
          ${now}::timestamptz
        from opened
        where
          opened.status =
            'OPEN'::attendance_session_status
        on conflict do nothing
        returning id
      )
      select
        opened.id,
        opened.policy_id,
        opened.attendance_date,
        opened.status,
        opened.opened_at
      from opened
    `);

  const row =
    Array.isArray(result)
      ? result[0]
      : null;

  if (!row) {
    throw new Error(
      "ATTENDANCE_SESSION_OPEN_FAILED",
    );
  }

  return {
    ok: true as const,
    clock,
    policy,
    session: row,
  };
}

export async function closeTodayAttendanceSession(
  access:
    SchoolAccess,
) {
  const clock =
    getSchoolClock(
      new Date(),
      access.school.timezone,
    );

  const db = getDb();

  const rows =
    await db
      .select({
        id:
          attendanceSessions.id,
        status:
          attendanceSessions.status,
      })
      .from(
        attendanceSessions,
      )
      .where(
        and(
          eq(
            attendanceSessions.schoolId,
            access.school.id,
          ),
          eq(
            attendanceSessions.attendanceDate,
            clock.date,
          ),
        ),
      )
      .limit(1);

  const session =
    rows[0];

  if (!session) {
    return {
      ok: false as const,
      status: 404 as const,
      code:
        "ATTENDANCE_SESSION_NOT_FOUND",
    };
  }

  if (
    session.status ===
      "CLOSED"
  ) {
    return {
      ok: true as const,
      replayed: true,
      session: {
        id:
          session.id,
        status:
          "CLOSED" as const,
      },
    };
  }

  if (
    session.status !==
      "OPEN"
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTENDANCE_SESSION_NOT_OPEN",
    };
  }

  const now =
    new Date().toISOString();

  const result =
    await db.execute(sql`
      with closed as (
        update attendance_sessions
        set
          status =
            'CLOSED'::attendance_session_status,
          closed_at =
            ${now}::timestamptz,
          updated_at =
            ${now}::timestamptz
        where
          school_id =
            ${access.school.id}::uuid
          and id =
            ${session.id}::uuid
          and status =
            'OPEN'::attendance_session_status
        returning
          id,
          school_id,
          status,
          closed_at
      ),
      closed_event as (
        insert into attendance_session_events (
          school_id,
          session_id,
          actor_membership_id,
          event_type,
          occurred_at,
          created_at
        )
        select
          closed.school_id,
          closed.id,
          ${access.membership.id}::uuid,
          'CLOSED'::attendance_session_event_type,
          closed.closed_at,
          ${now}::timestamptz
        from closed
        on conflict do nothing
        returning id
      )
      select
        closed.id,
        closed.status,
        closed.closed_at
      from closed
    `);

  const row =
    Array.isArray(result)
      ? result[0]
      : null;

  if (!row) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTENDANCE_SESSION_STATE_CHANGED",
    };
  }

  return {
    ok: true as const,
    replayed: false,
    session: row,
  };
}