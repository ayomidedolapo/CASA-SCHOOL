import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type { SchoolAccess } from "@/server/auth/authorization";
import {
  consumePasskeyStepUpGrantWithId,
} from "@/server/auth/passkey-step-up";
import type { BiometricAssertionPayload } from "@/server/attendance/biometric-assertion";
import {
  getAttendanceScopeRejection,
  resolveAttendanceOperationalScope,
} from "@/server/attendance/operational-scope";
import type { TerminalAccess } from "@/server/attendance/terminal-auth";
import {
  queueGuardianPresencePushBestEffort,
} from "@/server/messaging/guardian-presence-push";
import {
  runGuardianPushOutbox,
} from "@/server/messaging/guardian-push-worker";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export class TemporaryExitError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "TemporaryExitError";
  }
}

export async function authorizeTemporaryExit(input: {
  access: SchoolAccess;
  branchId: string;
  studentId: string;
  reason: string;
  stepUpToken: string | null | undefined;
}) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 240) {
    throw new TemporaryExitError(
      "A temporary step-out reason between 3 and 240 characters is required.",
      400,
      "TEMPORARY_EXIT_REASON_REQUIRED",
    );
  }

  const db = getDb();
  const state = rowsOf<{
    session_id: string;
    attendance_record_id: string;
    presence_state: "ON_CAMPUS" | "SIGNED_OUT";
    active_card_count: number;
    active_face_count: number;
    open_cycle_count: number;
  }>(await db.execute(sql`
    select
      session.id as session_id,
      record.id as attendance_record_id,
      record.presence_state::text as presence_state,
      (
        select count(*)::int
        from student_identity_cards card
        where card.school_id = record.school_id
          and card.student_id = record.student_id
          and card.status = 'ACTIVE'::student_identity_card_status
      ) as active_card_count,
      (
        select count(*)::int
        from student_biometric_profiles profile
        where profile.school_id = record.school_id
          and profile.student_id = record.student_id
          and profile.status = 'ACTIVE'::student_biometric_profile_status
      ) as active_face_count,
      (
        select count(*)::int
        from student_temporary_exit_cycles cycle
        where cycle.school_id = record.school_id
          and cycle.session_id = record.session_id
          and cycle.student_id = record.student_id
          and cycle.status in ('AUTHORIZED','OUTSIDE')
      ) as open_cycle_count
    from attendance_sessions session
    join attendance_branch_sessions branch_session
      on branch_session.school_id = session.school_id
     and branch_session.session_id = session.id
     and branch_session.branch_id = ${input.branchId}::uuid
    join student_attendance_records record
      on record.school_id = session.school_id
     and record.session_id = session.id
     and record.student_id = ${input.studentId}::uuid
    where session.school_id = ${input.access.school.id}::uuid
      and session.attendance_date =
        (now() at time zone ${input.access.school.timezone})::date
      and session.status = 'OPEN'::attendance_session_status
      and branch_session.status = 'OPEN'
    limit 1
  `))[0];

  if (!state) {
    throw new TemporaryExitError(
      "The student must already be checked in to an open attendance session before a temporary step-out can be authorized.",
      409,
      "TEMPORARY_EXIT_ON_CAMPUS_REQUIRED",
    );
  }
  if (state.presence_state !== "ON_CAMPUS") {
    throw new TemporaryExitError(
      "The student is already finally signed out for this attendance session.",
      409,
      "TEMPORARY_EXIT_ALREADY_SIGNED_OUT",
    );
  }
  if (Number(state.active_card_count) < 1) {
    throw new TemporaryExitError(
      "An ACTIVE student card is required because the student must verify the step-out and return at the Scanner.",
      409,
      "ACTIVE_CARD_REQUIRED",
    );
  }
  if (Number(state.active_face_count) < 1) {
    throw new TemporaryExitError(
      "An ACTIVE biometric profile is required because both temporary movement scans require face/liveness verification.",
      409,
      "ACTIVE_BIOMETRIC_PROFILE_REQUIRED",
    );
  }
  if (Number(state.open_cycle_count) > 0) {
    throw new TemporaryExitError(
      "This student already has an unfinished temporary step-out cycle.",
      409,
      "TEMPORARY_EXIT_ALREADY_OPEN",
    );
  }

  const grantId = await consumePasskeyStepUpGrantWithId({
    token: input.stepUpToken ?? "",
    access: input.access,
    action: "TEMPORARY_EXIT",
  });
  if (!grantId) {
    throw new TemporaryExitError(
      "Passkey step-up is required to authorize a temporary student step-out.",
      409,
      "PASSKEY_STEP_UP_REQUIRED",
    );
  }

  const inserted = rowsOf<{
    id: string;
    status: string;
    created_at: Date | string;
  }>(await db.execute(sql`
    insert into student_temporary_exit_cycles (
      school_id,
      branch_id,
      session_id,
      student_id,
      attendance_record_id,
      authorized_by_membership_id,
      passkey_grant_id,
      reason,
      status,
      created_at,
      updated_at
    )
    values (
      ${input.access.school.id}::uuid,
      ${input.branchId}::uuid,
      ${state.session_id}::uuid,
      ${input.studentId}::uuid,
      ${state.attendance_record_id}::uuid,
      ${input.access.membership.id}::uuid,
      ${grantId}::uuid,
      ${reason},
      'AUTHORIZED',
      now(),
      now()
    )
    returning id, status, created_at
  `))[0];

  if (!inserted) {
    throw new TemporaryExitError(
      "CASA could not create the temporary step-out authorization.",
      409,
      "TEMPORARY_EXIT_STATE_CHANGED",
    );
  }

  return {
    id: inserted.id,
    status: "AUTHORIZED" as const,
    reason,
    oneAuthorizationCoversReturn: true as const,
  };
}

export type TemporaryMovement =
  | "TEMPORARY_EXIT"
  | "TEMPORARY_RETURN";

async function queueSchoolMovementNotifications(input: {
  schoolId: string;
  branchId: string;
  studentId: string;
  cycleId: string;
  movement: TemporaryMovement;
  reason: string;
  occurredAt: string;
}) {
  const db = getDb();
  try {
    await db.execute(sql`
      with student_context as (
        select
          student.id as student_id,
          concat_ws(
            ' ',
            student.first_name,
            nullif(student.middle_name, ''),
            student.last_name
          ) as student_name
        from students student
        where student.school_id = ${input.schoolId}::uuid
          and student.id = ${input.studentId}::uuid
        limit 1
      ),
      recipients as (
        select distinct
          membership.id as membership_id,
          membership.user_id,
          student_context.student_name
        from school_memberships membership
        join school_membership_roles role
          on role.school_id = membership.school_id
         and role.membership_id = membership.id
        cross join student_context
        where membership.school_id = ${input.schoolId}::uuid
          and membership.status = 'ACTIVE'::school_membership_status
          and role.role in (
            'OWNER'::school_membership_role,
            'ADMIN'::school_membership_role,
            'SCHOOL_TECHNICIAN'::school_membership_role
          )
      )
      insert into casa_in_app_notifications (
        recipient_scope,
        recipient_user_id,
        recipient_internal_membership_id,
        recipient_school_membership_id,
        school_id,
        branch_id,
        audience,
        event_type,
        severity,
        title,
        body,
        action_url,
        source_audit_event_id,
        payload,
        status,
        read_at,
        created_at,
        updated_at
      )
      select
        'SCHOOL_OPERATOR',
        recipients.user_id,
        null,
        recipients.membership_id,
        ${input.schoolId}::uuid,
        ${input.branchId}::uuid,
        'SCHOOL_OPERATOR',
        ${input.movement},
        'INFO',
        case
          when ${input.movement} = 'TEMPORARY_EXIT'
            then 'Student stepped out temporarily'
          else 'Student returned to campus'
        end,
        case
          when ${input.movement} = 'TEMPORARY_EXIT'
            then recipients.student_name ||
              ' stepped out temporarily. Reason: ' || ${input.reason}
          else recipients.student_name ||
            ' is now back on the school campus.'
        end,
        null,
        null,
        jsonb_build_object(
          'source', 'ATTENDANCE_TEMPORARY_EXIT',
          'cycleId', ${input.cycleId},
          'studentId', ${input.studentId},
          'movement', ${input.movement},
          'reason', ${input.reason},
          'occurredAt', ${input.occurredAt}
        ),
        'UNREAD',
        null,
        now(),
        now()
      from recipients
      where not exists (
        select 1
        from casa_in_app_notifications existing
        where existing.recipient_scope = 'SCHOOL_OPERATOR'
          and existing.recipient_school_membership_id = recipients.membership_id
          and existing.event_type = ${input.movement}
          and existing.payload ->> 'cycleId' = ${input.cycleId}
      )
    `);
  } catch (error) {
    console.error("CASA_TEMPORARY_EXIT_SCHOOL_NOTIFICATION_FAILED", error);
  }
}

export async function finalizeTemporaryMovement(
  access: TerminalAccess,
  attemptId: string,
  assertion: BiometricAssertionPayload,
) {
  const db = getDb();

  const attempt = rowsOf<{
    id: string;
    school_id: string;
    session_id: string;
    terminal_id: string;
    student_id: string;
    card_id: string;
    operation: "CHECK_IN" | "CHECK_OUT";
    card_result: string;
    outcome: string;
    reason_code: string | null;
  }>(await db.execute(sql`
    select
      id,
      school_id,
      session_id,
      terminal_id,
      student_id,
      card_id,
      operation::text as operation,
      card_result::text as card_result,
      outcome::text as outcome,
      reason_code
    from attendance_verification_attempts
    where school_id = ${access.school.id}::uuid
      and terminal_id = ${access.terminal.id}::uuid
      and id = ${attemptId}::uuid
    limit 1
  `))[0];

  if (!attempt || !attempt.student_id || !attempt.card_id) {
    return {
      ok: false as const,
      status: 409 as const,
      code: "ATTEMPT_NOT_FINALIZABLE",
      message: "The temporary movement verification attempt is unavailable.",
    };
  }

  const movement: TemporaryMovement =
    attempt.reason_code === "TEMPORARY_EXIT_AUTHORIZED"
      ? "TEMPORARY_EXIT"
      : "TEMPORARY_RETURN";

  const eventType =
    movement === "TEMPORARY_EXIT"
      ? "TEMPORARY_EXITED"
      : "TEMPORARY_RETURNED";
  const guardianEvent =
    movement === "TEMPORARY_EXIT"
      ? "STUDENT_TEMPORARILY_OUT"
      : "STUDENT_RETURNED_TO_CAMPUS";

  if (attempt.outcome === "RECORDED") {
    const replay = rowsOf<{
      attendance_record_id: string;
      presence_event_id: string;
      cycle_id: string;
      branch_id: string;
      reason: string;
      occurred_at: Date | string;
    }>(await db.execute(sql`
      select
        event.attendance_record_id,
        event.id as presence_event_id,
        cycle.id as cycle_id,
        cycle.branch_id,
        cycle.reason,
        event.occurred_at
      from student_presence_events event
      join student_temporary_exit_cycles cycle
        on cycle.school_id = event.school_id
       and cycle.student_id = event.student_id
       and (
         cycle.step_out_event_id = event.id
         or cycle.return_event_id = event.id
       )
      where event.school_id = ${access.school.id}::uuid
        and event.attempt_id = ${attempt.id}::uuid
        and event.event_type::text = ${eventType}
      limit 1
    `))[0];

    if (!replay) {
      return {
        ok: false as const,
        status: 409 as const,
        code: "TEMPORARY_MOVEMENT_REPLAY_STATE_MISSING",
        message: "Temporary movement state is inconsistent.",
      };
    }

    const guardianPushQueued =
      await queueGuardianPresencePushBestEffort({
        schoolId: access.school.id,
        studentId: attempt.student_id,
        attendanceRecordId: replay.attendance_record_id,
        presenceEventId: replay.presence_event_id,
        eventType: guardianEvent,
      });

    return {
      ok: true as const,
      replayed: true,
      operation: attempt.operation,
      movement,
      attendanceRecordId: replay.attendance_record_id,
      presenceEventId: replay.presence_event_id,
      notificationQueued: 0,
      guardianPushQueued,
    };
  }

  if (
    attempt.outcome !== "PENDING" ||
    attempt.card_result !== "MATCHED" ||
    (
      movement === "TEMPORARY_EXIT"
        ? attempt.operation !== "CHECK_OUT"
        : attempt.operation !== "CHECK_IN"
    )
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code: "TEMPORARY_MOVEMENT_ATTEMPT_INVALID",
      message: "The temporary movement attempt cannot be finalized.",
    };
  }

  if (
    assertion.attemptId !== attempt.id ||
    assertion.studentId !== attempt.student_id
  ) {
    return {
      ok: false as const,
      status: 422 as const,
      code: "BIOMETRIC_ASSERTION_SUBJECT_MISMATCH",
      message: "Biometric evidence does not match this temporary movement.",
    };
  }

  const profile = rowsOf<{ provider: string }>(await db.execute(sql`
    select provider::text as provider
    from student_biometric_profiles
    where school_id = ${access.school.id}::uuid
      and student_id = ${attempt.student_id}::uuid
      and id = ${assertion.profileId}::uuid
      and status = 'ACTIVE'::student_biometric_profile_status
    limit 1
  `))[0];

  if (!profile || profile.provider !== assertion.provider) {
    return {
      ok: false as const,
      status: 422 as const,
      code: "ACTIVE_BIOMETRIC_PROFILE_REQUIRED",
      message: "The student does not have the matching ACTIVE biometric profile.",
    };
  }

  const operationalScope =
    await resolveAttendanceOperationalScope({
      schoolId: access.school.id,
      sessionId: attempt.session_id,
      terminalId: attempt.terminal_id,
      studentId: attempt.student_id,
    });

  const scopeRejection =
    getAttendanceScopeRejection(
      operationalScope,
      attempt.operation,
    );

  if (scopeRejection) {
    return {
      ok: false as const,
      status: 409 as const,
      code: scopeRejection.code,
      message: scopeRejection.message,
    };
  }

  const expectedCycleStatus =
    movement === "TEMPORARY_EXIT"
      ? "AUTHORIZED"
      : "OUTSIDE";
  const nextCycleStatus =
    movement === "TEMPORARY_EXIT"
      ? "OUTSIDE"
      : "RETURNED";
  const now = new Date().toISOString();

  const row = rowsOf<{
    attendance_record_id: string;
    presence_event_id: string;
    cycle_id: string;
    branch_id: string;
    reason: string;
    occurred_at: Date | string;
  }>(await db.execute(sql`
    with candidate as (
      select
        a.id as attempt_id,
        a.school_id,
        a.session_id,
        a.terminal_id,
        a.student_id,
        a.card_id,
        record.id as attendance_record_id,
        cycle.id as cycle_id,
        cycle.branch_id,
        cycle.reason,
        cycle.authorized_by_membership_id
      from attendance_verification_attempts a
      join student_attendance_records record
        on record.school_id = a.school_id
       and record.session_id = a.session_id
       and record.student_id = a.student_id
       and record.presence_state = 'ON_CAMPUS'::attendance_presence_state
       and record.checked_out_at is null
      join student_temporary_exit_cycles cycle
        on cycle.school_id = a.school_id
       and cycle.session_id = a.session_id
       and cycle.student_id = a.student_id
       and cycle.attendance_record_id = record.id
       and cycle.status = ${expectedCycleStatus}
      where a.school_id = ${access.school.id}::uuid
        and a.terminal_id = ${access.terminal.id}::uuid
        and a.id = ${attempt.id}::uuid
        and a.outcome = 'PENDING'::attendance_attempt_outcome
        and a.card_result = 'MATCHED'::attendance_card_result
        and a.reason_code = ${
          movement === "TEMPORARY_EXIT"
            ? "TEMPORARY_EXIT_AUTHORIZED"
            : "TEMPORARY_RETURN_AUTHORIZED"
        }
      limit 1
    ),
    inserted_evidence as (
      insert into biometric_verification_evidence (
        school_id,
        attempt_id,
        student_id,
        profile_id,
        assertion_id,
        provider,
        provider_verification_id,
        face_confidence_bps,
        liveness_confidence_bps,
        assertion_issued_at,
        verified_at,
        created_at
      )
      select
        candidate.school_id,
        candidate.attempt_id,
        candidate.student_id,
        ${assertion.profileId}::uuid,
        ${assertion.assertionId},
        ${assertion.provider},
        ${assertion.providerVerificationId},
        ${assertion.faceConfidenceBps},
        ${assertion.livenessConfidenceBps},
        ${assertion.issuedAt}::timestamptz,
        ${now}::timestamptz,
        ${now}::timestamptz
      from candidate
      on conflict do nothing
      returning attempt_id
    ),
    updated_attempt as (
      update attendance_verification_attempts a
      set
        face_result = 'PASSED'::attendance_face_result,
        face_confidence_bps = ${assertion.faceConfidenceBps},
        liveness_result = 'PASSED'::attendance_liveness_result,
        liveness_confidence_bps = ${assertion.livenessConfidenceBps},
        outcome = 'RECORDED'::attendance_attempt_outcome,
        completed_at = ${now}::timestamptz
      from candidate
      where a.school_id = candidate.school_id
        and a.id = candidate.attempt_id
        and exists (
          select 1 from inserted_evidence evidence
          where evidence.attempt_id = candidate.attempt_id
        )
      returning a.id
    ),
    inserted_event as (
      insert into student_presence_events (
        school_id,
        session_id,
        student_id,
        attendance_record_id,
        attempt_id,
        terminal_id,
        card_id,
        event_type,
        departure_result,
        actor_membership_id,
        reason,
        occurred_at,
        created_at
      )
      select
        candidate.school_id,
        candidate.session_id,
        candidate.student_id,
        candidate.attendance_record_id,
        candidate.attempt_id,
        candidate.terminal_id,
        candidate.card_id,
        ${eventType}::attendance_presence_event_type,
        'NOT_RUN'::attendance_departure_result,
        candidate.authorized_by_membership_id,
        candidate.reason,
        ${now}::timestamptz,
        ${now}::timestamptz
      from candidate
      where exists (
        select 1 from updated_attempt
        where updated_attempt.id = candidate.attempt_id
      )
      returning
        id,
        school_id,
        student_id,
        attendance_record_id,
        occurred_at
    ),
    updated_cycle as (
      update student_temporary_exit_cycles cycle
      set
        status = ${nextCycleStatus},
        step_out_attempt_id = case
          when ${movement} = 'TEMPORARY_EXIT' then candidate.attempt_id
          else cycle.step_out_attempt_id
        end,
        step_out_event_id = case
          when ${movement} = 'TEMPORARY_EXIT' then event.id
          else cycle.step_out_event_id
        end,
        stepped_out_at = case
          when ${movement} = 'TEMPORARY_EXIT' then event.occurred_at
          else cycle.stepped_out_at
        end,
        return_attempt_id = case
          when ${movement} = 'TEMPORARY_RETURN' then candidate.attempt_id
          else cycle.return_attempt_id
        end,
        return_event_id = case
          when ${movement} = 'TEMPORARY_RETURN' then event.id
          else cycle.return_event_id
        end,
        returned_at = case
          when ${movement} = 'TEMPORARY_RETURN' then event.occurred_at
          else cycle.returned_at
        end,
        updated_at = ${now}::timestamptz
      from candidate
      join inserted_event event
        on event.attendance_record_id = candidate.attendance_record_id
      where cycle.id = candidate.cycle_id
        and cycle.status = ${expectedCycleStatus}
      returning cycle.id, cycle.branch_id, cycle.reason
    )
    select
      event.attendance_record_id,
      event.id as presence_event_id,
      cycle.id as cycle_id,
      cycle.branch_id,
      cycle.reason,
      event.occurred_at
    from inserted_event event
    join updated_cycle cycle on true
    limit 1
  `))[0];

  if (!row) {
    return {
      ok: false as const,
      status: 409 as const,
      code: "TEMPORARY_MOVEMENT_STATE_CHANGED",
      message: "Temporary movement state changed before biometric verification completed.",
    };
  }

  let notificationQueued = 0;
  try {
    const queued = rowsOf<{ count: number }>(await db.execute(sql`
      with active_sender as (
        select id, school_id
        from school_whatsapp_senders
        where school_id = ${access.school.id}::uuid
          and status = 'ACTIVE'::school_messaging_sender_status
        limit 1
      ),
      recipients as (
        select
          sender.id as sender_id,
          guardian.id as guardian_id,
          guardian.phone as recipient_phone,
          concat_ws(
            ' ',
            student.first_name,
            nullif(student.middle_name, ''),
            student.last_name
          ) as student_name
        from active_sender sender
        join students student
          on student.school_id = sender.school_id
         and student.id = ${attempt.student_id}::uuid
        join student_guardians relationship
          on relationship.school_id = sender.school_id
         and relationship.student_id = student.id
         and relationship.receives_notifications = true
        join guardians guardian
          on guardian.school_id = relationship.school_id
         and guardian.id = relationship.guardian_id
         and guardian.status = 'ACTIVE'::guardian_status
         and guardian.phone is not null
         and length(trim(guardian.phone)) > 0
      ),
      inserted as (
        insert into school_notification_outbox (
          school_id,
          attendance_record_id,
          presence_event_id,
          guardian_id,
          sender_id,
          event_type,
          recipient_phone,
          template_key,
          payload,
          status,
          attempt_count,
          available_at,
          created_at,
          updated_at
        )
        select
          ${access.school.id}::uuid,
          ${row.attendance_record_id}::uuid,
          ${row.presence_event_id}::uuid,
          recipients.guardian_id,
          recipients.sender_id,
          ${guardianEvent}::school_notification_event_type,
          recipients.recipient_phone,
          case when ${movement} = 'TEMPORARY_EXIT'
            then 'student_temporarily_out'
            else 'student_returned_to_campus'
          end,
          jsonb_build_object(
            'studentId', ${attempt.student_id},
            'studentName', recipients.student_name,
            'temporaryExitCycleId', ${row.cycle_id},
            'movement', ${movement},
            'reason', ${row.reason},
            'occurredAt', ${row.occurred_at}
          ),
          'PENDING'::school_notification_delivery_status,
          0,
          now(),
          now(),
          now()
        from recipients
        on conflict do nothing
        returning id
      )
      select count(*)::int as count from inserted
    `));
    notificationQueued = Number(queued[0]?.count ?? 0);
  } catch {
    notificationQueued = 0;
  }

  const guardianPushQueued =
    await queueGuardianPresencePushBestEffort({
      schoolId: access.school.id,
      studentId: attempt.student_id,
      attendanceRecordId: row.attendance_record_id,
      presenceEventId: row.presence_event_id,
      eventType: guardianEvent,
    });

  await queueSchoolMovementNotifications({
    schoolId: access.school.id,
    branchId: row.branch_id,
    studentId: attempt.student_id,
    cycleId: row.cycle_id,
    movement,
    reason: row.reason,
    occurredAt: new Date(row.occurred_at).toISOString(),
  });

  try {
    await runGuardianPushOutbox({
      schoolId: access.school.id,
      presenceEventId: row.presence_event_id,
      limit: 50,
    });
  } catch {
    // Physical movement is authoritative; M53/M55 push retry remains best-effort.
  }

  return {
    ok: true as const,
    replayed: false,
    operation: attempt.operation,
    movement,
    attendanceRecordId: row.attendance_record_id,
    presenceEventId: row.presence_event_id,
    notificationQueued,
    guardianPushQueued,
  };
}
