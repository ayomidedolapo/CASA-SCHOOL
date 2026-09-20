import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  attendanceVerificationAttempts,
  studentAttendanceRecords,
  studentBiometricProfiles,
  studentPresenceEvents,
} from "@/db/schema";

import type {
  BiometricAssertionPayload,
} from "./biometric-assertion";
import type {
  TerminalAccess,
} from "./terminal-auth";

import {
  getAttendanceScopeRejection,
  resolveAttendanceOperationalScope,
} from "./operational-scope";
import {
  resolveTransportPunctuality,
} from "./transport-punctuality";
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export type FinalizePresenceResult =
  | {
      ok: true;
      replayed: boolean;
      operation:
        | "CHECK_IN"
        | "CHECK_OUT";
      attendanceRecordId:
        string;
      presenceEventId:
        string;
      notificationQueued: number;
    }
  | {
      ok: false;
      status: 409 | 422;
      code: string;
      message: string;
    };

export async function finalizeVerifiedPresence(
  access: TerminalAccess,
  attemptId: string,
  assertion:
    BiometricAssertionPayload,
): Promise<FinalizePresenceResult> {
  const db = getDb();

  const attemptRows =
    await db
      .select({
        id:
          attendanceVerificationAttempts.id,
        schoolId:
          attendanceVerificationAttempts.schoolId,
        sessionId:
          attendanceVerificationAttempts.sessionId,
        terminalId:
          attendanceVerificationAttempts.terminalId,
        studentId:
          attendanceVerificationAttempts.studentId,
        cardId:
          attendanceVerificationAttempts.cardId,
        operation:
          attendanceVerificationAttempts.operation,
        cardResult:
          attendanceVerificationAttempts.cardResult,
        faceResult:
          attendanceVerificationAttempts.faceResult,
        livenessResult:
          attendanceVerificationAttempts.livenessResult,
        timeResult:
          attendanceVerificationAttempts.timeResult,
        departureResult:
          attendanceVerificationAttempts.departureResult,
        outcome:
          attendanceVerificationAttempts.outcome,
        reasonCode:
          attendanceVerificationAttempts.reasonCode,
        occurredAt:
          attendanceVerificationAttempts.occurredAt,
      })
      .from(
        attendanceVerificationAttempts,
      )
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            access.school.id,
          ),
          eq(
            attendanceVerificationAttempts.terminalId,
            access.terminal.id,
          ),
          eq(
            attendanceVerificationAttempts.id,
            attemptId,
          ),
        ),
      )
      .limit(1);

  const attempt =
    attemptRows[0];

  if (!attempt) {
    return {
      ok: false,
      status: 409,
      code:
        "ATTEMPT_NOT_FOUND",
      message:
        "The verification attempt is unavailable for this terminal.",
    };
  }

  if (
    attempt.outcome ===
    "RECORDED"
  ) {
    const records =
      await db
        .select({
          id:
            studentAttendanceRecords.id,
        })
        .from(
          studentAttendanceRecords,
        )
        .where(
          and(
            eq(
              studentAttendanceRecords.schoolId,
              access.school.id,
            ),
            attempt.operation ===
              "CHECK_IN"
              ? eq(
                  studentAttendanceRecords.sourceAttemptId,
                  attempt.id,
                )
              : eq(
                  studentAttendanceRecords.checkOutAttemptId,
                  attempt.id,
                ),
          ),
        )
        .limit(1);

    const record =
      records[0];

    if (!record) {
      return {
        ok: false,
        status: 409,
        code:
          "RECORDED_ATTEMPT_WITHOUT_RECORD",
        message:
          "Attendance state is inconsistent.",
      };
    }

    const eventType =
      attempt.operation ===
      "CHECK_IN"
        ? "CHECKED_IN"
        : "CHECKED_OUT";

    const events =
      await db
        .select({
          id:
            studentPresenceEvents.id,
        })
        .from(
          studentPresenceEvents,
        )
        .where(
          and(
            eq(
              studentPresenceEvents.schoolId,
              access.school.id,
            ),
            eq(
              studentPresenceEvents.attendanceRecordId,
              record.id,
            ),
            eq(
              studentPresenceEvents.eventType,
              eventType,
            ),
          ),
        )
        .limit(1);

    if (!events[0]) {
      return {
        ok: false,
        status: 409,
        code:
          "RECORDED_ATTEMPT_WITHOUT_EVENT",
        message:
          "Presence-event state is inconsistent.",
      };
    }

    return {
      ok: true,
      replayed: true,
      operation:
        attempt.operation,
      attendanceRecordId:
        record.id,
      presenceEventId:
        events[0].id,
      notificationQueued: 0,
    };
  }

  if (
    attempt.outcome !==
      "PENDING" ||
    attempt.cardResult !==
      "MATCHED" ||
    !attempt.studentId ||
    !attempt.cardId
  ) {
    return {
      ok: false,
      status: 409,
      code:
        "ATTEMPT_NOT_FINALIZABLE",
      message:
        "The verification attempt cannot be finalized.",
    };
  }

  if (
    assertion.attemptId !==
      attempt.id ||
    assertion.studentId !==
      attempt.studentId
  ) {
    return {
      ok: false,
      status: 422,
      code:
        "BIOMETRIC_ASSERTION_SUBJECT_MISMATCH",
      message:
        "Biometric evidence does not match this attempt.",
    };
  }

  const profileRows =
    await db
      .select({
        id:
          studentBiometricProfiles.id,
        provider:
          studentBiometricProfiles.provider,
      })
      .from(
        studentBiometricProfiles,
      )
      .where(
        and(
          eq(
            studentBiometricProfiles.schoolId,
            access.school.id,
          ),
          eq(
            studentBiometricProfiles.studentId,
            attempt.studentId,
          ),
          eq(
            studentBiometricProfiles.id,
            assertion.profileId,
          ),
          eq(
            studentBiometricProfiles.status,
            "ACTIVE",
          ),
        ),
      )
      .limit(1);

  const profile =
    profileRows[0];

  if (
    !profile ||
    profile.provider !==
      assertion.provider
  ) {
    return {
      ok: false,
      status: 422,
      code:
        "ACTIVE_BIOMETRIC_PROFILE_REQUIRED",
      message:
        "The student does not have the matching active biometric profile.",
    };
  }

  if (
    attempt.operation ===
      "CHECK_OUT" &&
    attempt.reasonCode ===
      "EARLY_DEPARTURE_AUTH_REQUIRED"
  ) {
    return {
      ok: false,
      status: 409,
      code:
        "PASSKEY_STEP_UP_REQUIRED",
      message:
        "Early departure requires authorized staff Passkey step-up before finalization.",
    };
  }

  if (
    attempt.operation ===
      "CHECK_IN" &&
    !(
      attempt.timeResult ===
        "ON_TIME" ||
      attempt.timeResult ===
        "LATE"
    )
  ) {
    return {
      ok: false,
      status: 409,
      code:
        "CHECK_IN_TIME_NOT_ACCEPTED",
      message:
        "The check-in attempt is outside an accepted arrival classification.",
    };
  }

  if (
    attempt.operation ===
      "CHECK_OUT" &&
    attempt.departureResult !==
      "NORMAL"
  ) {
    return {
      ok: false,
      status: 409,
      code:
        "CHECK_OUT_NOT_ACCEPTED",
      message:
        "The check-out attempt is not a normal finalizable departure.",
    };
  }

    const operationalScope =
    await resolveAttendanceOperationalScope({
      schoolId:
        access.school.id,
      sessionId:
        attempt.sessionId,
      terminalId:
        attempt.terminalId,
      studentId:
        attempt.studentId,
    });

  const scopeRejection =
    getAttendanceScopeRejection(
      operationalScope,
      attempt.operation,
    );

  if (scopeRejection) {
    return {
      ok: false,
      status: 409,
      code:
        scopeRejection.code,
      message:
        scopeRejection.message,
    };
  }

  const now =
    new Date().toISOString();

  const branchModeRow = rowsOf<{ mode: "INSTRUCTIONAL" | "PRESENCE_ONLY" }>(
    await db.execute(sql`
      select bs.mode
      from school_branch_terminals terminal_branch
      join attendance_branch_sessions bs
        on bs.school_id = terminal_branch.school_id
       and bs.branch_id = terminal_branch.branch_id
       and bs.session_id = ${attempt.sessionId}::uuid
      where terminal_branch.school_id = ${access.school.id}::uuid
        and terminal_branch.terminal_id = ${attempt.terminalId}::uuid
      limit 1
    `),
  )[0];
  const presenceOnly = branchModeRow?.mode === "PRESENCE_ONLY";

  const punctuality =
    attempt.operation ===
      "CHECK_IN" && !presenceOnly
      ? await resolveTransportPunctuality({
          schoolId:
            access.school.id,
          studentId:
            attempt.studentId,
          sessionId:
            attempt.sessionId,
          occurredAt:
            attempt.occurredAt,
        })
      : null;

  const status =
    punctuality?.outcome ===
      "LATE"
      ? "LATE"
      : "ON_TIME";

  if (
    attempt.operation ===
    "CHECK_IN"
  ) {
    await db.execute(sql`
      with candidate as (
        select
          a.id,
          a.school_id,
          a.session_id,
          a.terminal_id,
          a.student_id,
          a.card_id
        from attendance_verification_attempts a
        where
          a.school_id =
            ${access.school.id}::uuid
          and a.terminal_id =
            ${access.terminal.id}::uuid
          and a.id =
            ${attempt.id}::uuid
          and a.student_id =
            ${attempt.studentId}::uuid
          and a.operation =
            'CHECK_IN'::attendance_operation
          and a.card_result =
            'MATCHED'::attendance_card_result
          and a.outcome =
            'PENDING'::attendance_attempt_outcome
          and a.time_result in (
            'ON_TIME'::attendance_time_result,
            'LATE'::attendance_time_result
          )
      ),
      inserted_record as (
        insert into student_attendance_records (
          school_id,
          session_id,
          student_id,
          terminal_id,
          card_id,
          source_attempt_id,
          status,
          official_start_time,
          actual_arrival_at,
          arrival_method,
          arrival_method_assignment_id,
          grace_minutes_used,
          minutes_after_official_start,
          punctuality_outcome,
          punctuality_policy_id,
          count_for_attendance,
          presence_state,
          departure_result,
          recorded_at,
          created_at
        )
        select
          candidate.school_id,
          candidate.session_id,
          candidate.student_id,
          candidate.terminal_id,
          candidate.card_id,
          candidate.id,
          ${status}::attendance_record_status,
          ${punctuality?.officialStartTime ?? null}::time,
          ${punctuality?.actualArrivalAt ?? null}::timestamptz,
          ${punctuality?.arrivalMethod ?? null},
          ${punctuality?.arrivalMethodAssignmentId ?? null}::uuid,
          ${punctuality?.graceMinutesUsed ?? null},
          ${punctuality?.minutesAfterOfficialStart ?? null},
          ${punctuality?.outcome ?? null},
          ${punctuality?.policyId ?? null}::uuid,
          ${!presenceOnly},
          'ON_CAMPUS'::attendance_presence_state,
          'NOT_RUN'::attendance_departure_result,
          ${now}::timestamptz,
          ${now}::timestamptz
        from candidate
        on conflict (
          school_id,
          session_id,
          student_id
        ) do nothing
        returning
          id,
          school_id,
          session_id,
          student_id,
          terminal_id,
          card_id,
          source_attempt_id
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
          inserted_record.school_id,
          inserted_record.source_attempt_id,
          inserted_record.student_id,
          ${assertion.profileId}::uuid,
          ${assertion.assertionId},
          ${assertion.provider},
          ${assertion.providerVerificationId},
          ${assertion.faceConfidenceBps},
          ${assertion.livenessConfidenceBps},
          ${assertion.issuedAt}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        from inserted_record
        on conflict do nothing
        returning
          attempt_id
      ),
      updated_attempt as (
        update attendance_verification_attempts a
        set
          face_result =
            'PASSED'::attendance_face_result,
          face_confidence_bps =
            ${assertion.faceConfidenceBps},
          liveness_result =
            'PASSED'::attendance_liveness_result,
          liveness_confidence_bps =
            ${assertion.livenessConfidenceBps},
          outcome =
            'RECORDED'::attendance_attempt_outcome,
          reason_code = null,
          completed_at =
            ${now}::timestamptz
        where
          a.school_id =
            ${access.school.id}::uuid
          and a.id =
            ${attempt.id}::uuid
          and a.outcome =
            'PENDING'::attendance_attempt_outcome
          and exists (
            select 1
            from inserted_evidence e
            where e.attempt_id = a.id
          )
        returning id
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
          occurred_at,
          created_at
        )
        select
          r.school_id,
          r.session_id,
          r.student_id,
          r.id,
          r.source_attempt_id,
          r.terminal_id,
          r.card_id,
          'CHECKED_IN'::attendance_presence_event_type,
          'NOT_RUN'::attendance_departure_result,
          ${now}::timestamptz,
          ${now}::timestamptz
        from inserted_record r
        where exists (
          select 1
          from updated_attempt u
          where
            u.id =
              r.source_attempt_id
        )
        on conflict do nothing
        returning
          id,
          school_id,
          student_id,
          attendance_record_id,
          occurred_at
      ),
      active_sender as (
        select
          s.id,
          s.school_id
        from school_whatsapp_senders s
        where
          s.school_id =
            ${access.school.id}::uuid
          and s.status =
            'ACTIVE'::school_messaging_sender_status
        limit 1
      ),
      recipients as (
        select
          e.id as presence_event_id,
          e.school_id,
          e.student_id,
          e.attendance_record_id,
          e.occurred_at,
          sender.id as sender_id,
          g.id as guardian_id,
          g.phone as recipient_phone,
          st.casa_student_id,
          concat_ws(
            ' ',
            st.first_name,
            nullif(
              st.middle_name,
              ''
            ),
            st.last_name
          ) as student_name
        from inserted_event e
        join active_sender sender
          on sender.school_id =
            e.school_id
        join student_guardians sg
          on sg.school_id =
            e.school_id
          and sg.student_id =
            e.student_id
          and sg.receives_notifications =
            true
        join guardians g
          on g.school_id =
            sg.school_id
          and g.id =
            sg.guardian_id
          and g.status =
            'ACTIVE'::guardian_status
          and g.phone is not null
          and length(trim(g.phone)) > 0
        join students st
          on st.school_id =
            e.school_id
          and st.id =
            e.student_id
      )
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
        recipients.school_id,
        recipients.attendance_record_id,
        recipients.presence_event_id,
        recipients.guardian_id,
        recipients.sender_id,
        'STUDENT_CHECKED_IN'::school_notification_event_type,
        recipients.recipient_phone,
        'student_checked_in',
        jsonb_build_object(
          'studentName',
            recipients.student_name,
          'casaStudentId',
            recipients.casa_student_id,
          'checkedInAt',
            recipients.occurred_at
        ),
        'PENDING'::school_notification_delivery_status,
        0,
        ${now}::timestamptz,
        ${now}::timestamptz,
        ${now}::timestamptz
      from recipients
      on conflict do nothing
    `);
  } else {
    await db.execute(sql`
      with candidate as (
        select
          a.id,
          a.school_id,
          a.session_id,
          a.terminal_id,
          a.student_id,
          a.card_id
        from attendance_verification_attempts a
        where
          a.school_id =
            ${access.school.id}::uuid
          and a.terminal_id =
            ${access.terminal.id}::uuid
          and a.id =
            ${attempt.id}::uuid
          and a.student_id =
            ${attempt.studentId}::uuid
          and a.operation =
            'CHECK_OUT'::attendance_operation
          and a.card_result =
            'MATCHED'::attendance_card_result
          and a.outcome =
            'PENDING'::attendance_attempt_outcome
          and a.departure_result =
            'NORMAL'::attendance_departure_result
      ),
      updated_record as (
        update student_attendance_records r
        set
          presence_state =
            'SIGNED_OUT'::attendance_presence_state,
          departure_result =
            'NORMAL'::attendance_departure_result,
          checked_out_at =
            ${now}::timestamptz,
          check_out_attempt_id =
            candidate.id,
          check_out_terminal_id =
            candidate.terminal_id,
          check_out_card_id =
            candidate.card_id
        from candidate
        where
          r.school_id =
            candidate.school_id
          and r.session_id =
            candidate.session_id
          and r.student_id =
            candidate.student_id
          and r.presence_state =
            'ON_CAMPUS'::attendance_presence_state
          and r.checked_out_at is null
        returning
          r.id,
          r.school_id,
          r.session_id,
          r.student_id,
          r.check_out_attempt_id,
          r.check_out_terminal_id,
          r.check_out_card_id
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
          updated_record.school_id,
          updated_record.check_out_attempt_id,
          updated_record.student_id,
          ${assertion.profileId}::uuid,
          ${assertion.assertionId},
          ${assertion.provider},
          ${assertion.providerVerificationId},
          ${assertion.faceConfidenceBps},
          ${assertion.livenessConfidenceBps},
          ${assertion.issuedAt}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        from updated_record
        on conflict do nothing
        returning
          attempt_id
      ),
      updated_attempt as (
        update attendance_verification_attempts a
        set
          face_result =
            'PASSED'::attendance_face_result,
          face_confidence_bps =
            ${assertion.faceConfidenceBps},
          liveness_result =
            'PASSED'::attendance_liveness_result,
          liveness_confidence_bps =
            ${assertion.livenessConfidenceBps},
          outcome =
            'RECORDED'::attendance_attempt_outcome,
          reason_code = null,
          completed_at =
            ${now}::timestamptz
        where
          a.school_id =
            ${access.school.id}::uuid
          and a.id =
            ${attempt.id}::uuid
          and a.outcome =
            'PENDING'::attendance_attempt_outcome
          and exists (
            select 1
            from inserted_evidence e
            where e.attempt_id = a.id
          )
        returning id
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
          occurred_at,
          created_at
        )
        select
          r.school_id,
          r.session_id,
          r.student_id,
          r.id,
          r.check_out_attempt_id,
          r.check_out_terminal_id,
          r.check_out_card_id,
          'CHECKED_OUT'::attendance_presence_event_type,
          'NORMAL'::attendance_departure_result,
          ${now}::timestamptz,
          ${now}::timestamptz
        from updated_record r
        where exists (
          select 1
          from updated_attempt u
          where
            u.id =
              r.check_out_attempt_id
        )
        on conflict do nothing
        returning
          id,
          school_id,
          student_id,
          attendance_record_id,
          occurred_at
      ),
      active_sender as (
        select
          s.id,
          s.school_id
        from school_whatsapp_senders s
        where
          s.school_id =
            ${access.school.id}::uuid
          and s.status =
            'ACTIVE'::school_messaging_sender_status
        limit 1
      ),
      recipients as (
        select
          e.id as presence_event_id,
          e.school_id,
          e.student_id,
          e.attendance_record_id,
          e.occurred_at,
          sender.id as sender_id,
          g.id as guardian_id,
          g.phone as recipient_phone,
          st.casa_student_id,
          concat_ws(
            ' ',
            st.first_name,
            nullif(
              st.middle_name,
              ''
            ),
            st.last_name
          ) as student_name
        from inserted_event e
        join active_sender sender
          on sender.school_id =
            e.school_id
        join student_guardians sg
          on sg.school_id =
            e.school_id
          and sg.student_id =
            e.student_id
          and sg.receives_notifications =
            true
        join guardians g
          on g.school_id =
            sg.school_id
          and g.id =
            sg.guardian_id
          and g.status =
            'ACTIVE'::guardian_status
          and g.phone is not null
          and length(
            trim(g.phone)
          ) > 0
        join students st
          on st.school_id =
            e.school_id
          and st.id =
            e.student_id
      )
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
        recipients.school_id,
        recipients.attendance_record_id,
        recipients.presence_event_id,
        recipients.guardian_id,
        recipients.sender_id,
        'STUDENT_SIGNED_OUT'::school_notification_event_type,
        recipients.recipient_phone,
        'student_signed_out',
        jsonb_build_object(
          'studentName',
            recipients.student_name,
          'casaStudentId',
            recipients.casa_student_id,
          'signedOutAt',
            recipients.occurred_at,
          'message',
            recipients.student_name ||
            ' has checked out of school for the day.'
        ),
        'PENDING'::school_notification_delivery_status,
        0,
        ${now}::timestamptz,
        ${now}::timestamptz,
        ${now}::timestamptz
      from recipients
      on conflict do nothing
    `);
  }

  const finalAttemptRows =
    await db
      .select({
        outcome:
          attendanceVerificationAttempts.outcome,
      })
      .from(
        attendanceVerificationAttempts,
      )
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            access.school.id,
          ),
          eq(
            attendanceVerificationAttempts.id,
            attempt.id,
          ),
        ),
      )
      .limit(1);

  if (
    finalAttemptRows[0]
      ?.outcome !==
    "RECORDED"
  ) {
    await db
      .update(
        attendanceVerificationAttempts,
      )
      .set({
        outcome:
          "REJECTED",
        reasonCode:
          "FINALIZATION_STATE_CONFLICT",
        completedAt:
          new Date(now),
      })
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            access.school.id,
          ),
          eq(
            attendanceVerificationAttempts.id,
            attempt.id,
          ),
          eq(
            attendanceVerificationAttempts.outcome,
            "PENDING",
          ),
        ),
      );

    return {
      ok: false,
      status: 409,
      code:
        "FINALIZATION_STATE_CONFLICT",
      message:
        "Presence changed before biometric finalization could complete.",
    };
  }

  const recordRows =
    await db
      .select({
        id:
          studentAttendanceRecords.id,
      })
      .from(
        studentAttendanceRecords,
      )
      .where(
        and(
          eq(
            studentAttendanceRecords.schoolId,
            access.school.id,
          ),
          attempt.operation ===
            "CHECK_IN"
            ? eq(
                studentAttendanceRecords.sourceAttemptId,
                attempt.id,
              )
            : eq(
                studentAttendanceRecords.checkOutAttemptId,
                attempt.id,
              ),
        ),
      )
      .limit(1);

  const record =
    recordRows[0];

  if (!record) {
    throw new Error(
      "Finalized presence record was not found.",
    );
  }

  const eventType =
    attempt.operation ===
    "CHECK_IN"
      ? "CHECKED_IN"
      : "CHECKED_OUT";

  const eventRows =
    await db
      .select({
        id:
          studentPresenceEvents.id,
      })
      .from(
        studentPresenceEvents,
      )
      .where(
        and(
          eq(
            studentPresenceEvents.schoolId,
            access.school.id,
          ),
          eq(
            studentPresenceEvents.attendanceRecordId,
            record.id,
          ),
          eq(
            studentPresenceEvents.eventType,
            eventType,
          ),
        ),
      )
      .limit(1);

  const event =
    eventRows[0];

  if (!event) {
    throw new Error(
      "Finalized presence event was not found.",
    );
  }

  const notificationEventType =
    attempt.operation ===
      "CHECK_IN"
      ? "STUDENT_CHECKED_IN"
      : "STUDENT_SIGNED_OUT";

  const outboxRows =
    await db.execute(sql`
      select
        count(*)::int as count
      from school_notification_outbox
      where
        school_id =
          ${access.school.id}::uuid
        and presence_event_id =
          ${event.id}::uuid
        and event_type =
          ${notificationEventType}::school_notification_event_type
    `);

  const outboxRow =
    Array.isArray(outboxRows)
      ? outboxRows[0]
      : null;

  const notificationQueued =
    Number(
      (
        outboxRow as
          | {
              count?: unknown;
            }
          | undefined
      )?.count ?? 0,
    );

  return {
    ok: true,
    replayed: false,
    operation:
      attempt.operation,
    attendanceRecordId:
      record.id,
    presenceEventId:
      event.id,
    notificationQueued,
  };
}