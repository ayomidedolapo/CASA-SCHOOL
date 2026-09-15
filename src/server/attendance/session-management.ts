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
  getAttendanceReadinessRejection,
  isInstructionalDate,
} from "./readiness";
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

  const readinessRejection =
    await getAttendanceReadinessRejection({
      schoolId:
        access.school.id,
      date:
        clock.date,
    });

  if (readinessRejection) {
    return {
      ok: false as const,
      status:
        readinessRejection.status,
      code:
        readinessRejection.code,
    };
  }

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

  if (
    !await isInstructionalDate({
      schoolId:
        access.school.id,
      date:
        clock.date,
      branchId:
        null,
    })
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "NON_INSTRUCTIONAL_DAY" as const,
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

  // Normalize db.execute result rows across Drizzle/Neon adapters.
  const resultRows =
    Array.isArray(
      result,
    )
      ? result
      : result &&
          typeof result ===
            "object" &&
          "rows" in result &&
          Array.isArray(
            result.rows,
          )
        ? result.rows
        : [];

  const row =
    resultRows[0] ??
    null;

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

  // Normalize db.execute result rows across Drizzle/Neon adapters.
  const resultRows =
    Array.isArray(
      result,
    )
      ? result
      : result &&
          typeof result ===
            "object" &&
          "rows" in result &&
          Array.isArray(
            result.rows,
          )
        ? result.rows
        : [];

  const row =
    resultRows[0] ??
    null;

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

export async function reopenTodayAttendanceSession(
  access:
    SchoolAccess,
  reason:
    string,
) {
  const clock =
    getSchoolClock(
      new Date(),
      access.school.timezone,
    );

  const normalizedReason =
    reason.trim();

  if (
    normalizedReason.length <
      8 ||
    normalizedReason.length >
      240
  ) {
    return {
      ok: false as const,
      status: 400 as const,
      code:
        "ATTENDANCE_SESSION_REOPEN_REASON_REQUIRED",
    };
  }

  const db =
    getDb();

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
    session.status !==
      "CLOSED"
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        session.status ===
          "OPEN"
          ? "ATTENDANCE_SESSION_ALREADY_OPEN"
          : "ATTENDANCE_SESSION_REOPEN_NOT_ALLOWED",
    };
  }

  const now =
    new Date().toISOString();

  const result =
    await db.execute(sql`
      with reopened as (
        update attendance_sessions
        set
          status =
            'OPEN'::attendance_session_status,
          closed_at =
            null,
          updated_at =
            ${now}::timestamptz
        where
          school_id =
            ${access.school.id}::uuid
          and id =
            ${session.id}::uuid
          and attendance_date =
            ${clock.date}::date
          and status =
            'CLOSED'::attendance_session_status
        returning
          id,
          school_id,
          policy_id,
          attendance_date,
          status,
          opened_at
      ),
      reopened_event as (
        insert into attendance_session_events (
          school_id,
          session_id,
          actor_membership_id,
          event_type,
          reason,
          occurred_at,
          created_at
        )
        select
          reopened.school_id,
          reopened.id,
          ${access.membership.id}::uuid,
          'REOPENED'::attendance_session_event_type,
          ${normalizedReason},
          ${now}::timestamptz,
          ${now}::timestamptz
        from reopened
        returning id
      )
      select
        reopened.id,
        reopened.policy_id,
        reopened.attendance_date,
        reopened.status,
        reopened.opened_at,
        (
          select count(*)::int
          from reopened_event
        ) as reopen_event_count
      from reopened
    `);

  // Normalize db.execute result rows across Drizzle/Neon adapters.
  const resultRows =
    Array.isArray(
      result,
    )
      ? result
      : result &&
          typeof result ===
            "object" &&
          "rows" in result &&
          Array.isArray(
            result.rows,
          )
        ? result.rows
        : [];

  const row =
    resultRows[0] ??
    null;

  if (
    !row ||
    Number(
      (
        row as {
          reopen_event_count?:
            number;
        }
      ).reopen_event_count ??
        0,
    ) !==
      1
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTENDANCE_SESSION_STATE_CHANGED",
    };
  }

  return {
    ok: true as const,
    replayed:
      false,
    clock,
    session: row,
  };
}

export async function rebindTodayAttendanceSessionPolicy(
  access:
    SchoolAccess,
  reason:
    string,
  passkeyGrantId:
    string,
) {
  const clock =
    getSchoolClock(
      new Date(),
      access.school.timezone,
    );

  const normalizedReason =
    reason.trim();

  if (
    normalizedReason.length <
      8 ||
    normalizedReason.length >
      240
  ) {
    return {
      ok: false as const,
      status: 400 as const,
      code:
        "ATTENDANCE_SESSION_POLICY_REBIND_REASON_REQUIRED",
    };
  }

  const targetPolicy =
    await resolveDefaultPolicyForDate({
      schoolId:
        access.school.id,
      date:
        clock.date,
      weekday:
        clock.weekday,
    });

  if (!targetPolicy) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTENDANCE_SESSION_POLICY_REBIND_TARGET_REQUIRED",
    };
  }

  const targetOpen =
    targetPolicy.checkInOpensAt.slice(
      0,
      5,
    );

  const targetClose =
    targetPolicy.checkInClosesAt.slice(
      0,
      5,
    );

  if (
    clock.clock <
      targetOpen ||
    clock.clock >
      targetClose
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTENDANCE_SESSION_POLICY_REBIND_WINDOW_CLOSED",
    };
  }

  const db =
    getDb();

  const now =
    new Date().toISOString();

  const result =
    await db.execute(sql`
      with candidate as (
        select
          s.id,
          s.school_id,
          s.policy_id
            as from_policy_id,
          ${targetPolicy.id}::uuid
            as to_policy_id
        from attendance_sessions s
        where
          s.school_id =
            ${access.school.id}::uuid
          and s.attendance_date =
            ${clock.date}::date
          and s.status =
            'OPEN'::attendance_session_status
          and s.policy_id <>
            ${targetPolicy.id}::uuid
          and not exists (
            select 1
            from attendance_verification_attempts a
            where
              a.school_id =
                s.school_id
              and a.session_id =
                s.id
              and not (
                a.operation::text =
                  'CHECK_IN'
                and a.card_result::text =
                  'MATCHED'
                and a.face_result::text =
                  'NOT_RUN'
                and a.liveness_result::text =
                  'NOT_RUN'
                and a.time_result::text =
                  'OUTSIDE_WINDOW'
                and a.outcome::text =
                  'REJECTED'
                and a.reason_code =
                  'CHECK_IN_WINDOW_CLOSED'
                and a.completed_at
                  is not null
              )
          )
          and not exists (
            select 1
            from student_attendance_records r
            where
              r.school_id =
                s.school_id
              and r.session_id =
                s.id
          )
          and not exists (
            select 1
            from student_presence_events p
            where
              p.school_id =
                s.school_id
              and p.session_id =
                s.id
          )
          and not exists (
            select 1
            from biometric_verification_evidence e
            where
              e.school_id =
                s.school_id
              and exists (
                select 1
                from attendance_verification_attempts a
                where
                  a.school_id =
                    e.school_id
                  and a.id =
                    e.attempt_id
                  and a.session_id =
                    s.id
              )
          )
        for update
      ),
      rebound as (
        update attendance_sessions s
        set
          policy_id =
            candidate.to_policy_id,
          updated_at =
            ${now}::timestamptz
        from candidate
        where
          s.school_id =
            candidate.school_id
          and s.id =
            candidate.id
          and s.policy_id =
            candidate.from_policy_id
        returning
          s.id,
          s.school_id,
          candidate.from_policy_id,
          s.policy_id
            as to_policy_id,
          s.attendance_date,
          s.status,
          s.opened_at,
          s.closed_at
      ),
      audit as (
        insert into attendance_session_policy_rebinds (
          school_id,
          session_id,
          from_policy_id,
          to_policy_id,
          actor_membership_id,
          passkey_grant_id,
          reason,
          rebound_at,
          created_at
        )
        select
          rebound.school_id,
          rebound.id,
          rebound.from_policy_id,
          rebound.to_policy_id,
          ${access.membership.id}::uuid,
          ${passkeyGrantId}::uuid,
          ${normalizedReason},
          ${now}::timestamptz,
          ${now}::timestamptz
        from rebound
        returning id
      )
      select
        rebound.id,
        rebound.from_policy_id,
        rebound.to_policy_id,
        rebound.attendance_date,
        rebound.status,
        rebound.opened_at,
        rebound.closed_at,
        (
          select count(*)::int
          from audit
        ) as rebind_audit_count
      from rebound
    `);

  // Normalize db.execute result rows across Drizzle/Neon adapters.
  const resultRows =
    Array.isArray(
      result,
    )
      ? result
      : result &&
          typeof result ===
            "object" &&
          "rows" in result &&
          Array.isArray(
            (
              result as {
                rows?: unknown;
              }
            ).rows,
          )
        ? (
            result as {
              rows: unknown[];
            }
          ).rows
        : [];

  const row =
    resultRows[0] ??
    null;

  if (
    !row ||
    Number(
      (
        row as {
          rebind_audit_count?:
            number;
        }
      ).rebind_audit_count ??
        0,
    ) !==
      1
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTENDANCE_SESSION_POLICY_REBIND_STATE_CHANGED",
    };
  }

  return {
    ok: true as const,
    replayed:
      false,
    clock,
    session:
      row,
  };
}

