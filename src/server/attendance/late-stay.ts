import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type { SchoolAccess } from "@/server/auth/authorization";
import { consumePasskeyStepUpGrantWithId } from "@/server/auth/passkey-step-up";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export async function authorizeLateStay(input: {
  access: SchoolAccess;
  branchId: string;
  studentIds: string[];
  reason: string;
  allowedUntil: string;
  stepUpToken: string | null | undefined;
}) {
  const db = getDb();
  const reason = input.reason.trim();
  const allowed = new Date(input.allowedUntil);
  if (!reason || !Number.isFinite(allowed.getTime()) || allowed.getTime() <= Date.now()) {
    return { ok: false as const, status: 400 as const, code: "LATE_STAY_DETAILS_REQUIRED" as const };
  }

  const unique = Array.from(new Set(input.studentIds));
  if (unique.length === 0 || unique.length > 100) {
    return { ok: false as const, status: 400 as const, code: "LATE_STAY_SELECTION_REQUIRED" as const };
  }

  const session = rowsOf<{
    session_id: string;
    attendance_date: string;
    branch_session_id: string;
    branch_status: string;
  }>(await db.execute(sql`
    select
      s.id as session_id,
      s.attendance_date::text as attendance_date,
      bs.id as branch_session_id,
      bs.status as branch_status
    from attendance_sessions s
    join attendance_branch_sessions bs
      on bs.school_id = s.school_id and bs.session_id = s.id
    where s.school_id = ${input.access.school.id}::uuid
      and bs.branch_id = ${input.branchId}::uuid
      and s.attendance_date = (now() at time zone ${input.access.school.timezone})::date
    limit 1
  `))[0];

  if (!session || !["OPEN", "CLOSED"].includes(session.branch_status)) {
    return { ok: false as const, status: 409 as const, code: "ATTENDANCE_SESSION_NOT_AVAILABLE" as const };
  }

  const candidates = rowsOf<{ student_id: string; attendance_record_id: string }>(await db.execute(sql`
    select r.student_id::text as student_id, r.id::text as attendance_record_id
    from student_attendance_records r
    join lateral (
      select e.class_arm_id
      from student_enrollments e
      where e.school_id = r.school_id
        and e.student_id = r.student_id
        and e.starts_on <= ${session.attendance_date}::date
        and (e.ends_on is null or e.ends_on >= ${session.attendance_date}::date)
      order by e.starts_on desc, e.created_at desc
      limit 1
    ) e on true
    join school_branch_class_arms m
      on m.school_id = r.school_id and m.class_arm_id = e.class_arm_id
    where r.school_id = ${input.access.school.id}::uuid
      and r.session_id = ${session.session_id}::uuid
      and m.branch_id = ${input.branchId}::uuid
      and r.presence_state = 'ON_CAMPUS'::attendance_presence_state
      and r.checked_out_at is null
      and r.student_id in (
        select value::uuid from jsonb_array_elements_text(${JSON.stringify(unique)}::jsonb)
      )
  `));

  if (candidates.length !== unique.length) {
    return { ok: false as const, status: 409 as const, code: "LATE_STAY_STUDENT_NOT_ELIGIBLE" as const };
  }

  if (!input.stepUpToken) {
    return { ok: false as const, status: 403 as const, code: "PASSKEY_STEP_UP_REQUIRED" as const, requiredAction: "LATE_DEPARTURE" as const };
  }
  const grantId = await consumePasskeyStepUpGrantWithId({
    token: input.stepUpToken,
    access: input.access,
    action: "LATE_DEPARTURE",
  });
  if (!grantId) {
    return { ok: false as const, status: 403 as const, code: "PASSKEY_STEP_UP_REQUIRED" as const, requiredAction: "LATE_DEPARTURE" as const };
  }

  const now = new Date().toISOString();
  const ids = candidates.map((candidate) => candidate.student_id);
  await db.execute(sql`
    update attendance_late_stay_authorizations
    set revoked_at = ${now}::timestamptz, updated_at = ${now}::timestamptz
    where school_id = ${input.access.school.id}::uuid
      and session_id = ${session.session_id}::uuid
      and student_id in (select value::uuid from jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))
      and revoked_at is null and consumed_at is null
  `);

  const inserted = rowsOf<{ id: string }>(await db.execute(sql`
    insert into attendance_late_stay_authorizations (
      school_id, session_id, branch_id, student_id, attendance_record_id,
      authorized_by_membership_id, passkey_grant_id, reason, allowed_until,
      created_at, updated_at
    )
    select
      ${input.access.school.id}::uuid,
      ${session.session_id}::uuid,
      ${input.branchId}::uuid,
      c.student_id::uuid,
      c.attendance_record_id::uuid,
      ${input.access.membership.id}::uuid,
      ${grantId}::uuid,
      ${reason},
      ${allowed.toISOString()}::timestamptz,
      ${now}::timestamptz,
      ${now}::timestamptz
    from jsonb_to_recordset(${JSON.stringify(candidates)}::jsonb)
      as c(student_id text, attendance_record_id text)
    returning id
  `));

  return {
    ok: true as const,
    requested: unique.length,
    authorized: inserted.length,
    allowedUntil: allowed.toISOString(),
  };
}
