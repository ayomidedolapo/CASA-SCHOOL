import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  attendanceEarlyDepartureAuthorizations,
  attendanceVerificationAttempts,
  studentAttendanceRecords,
  studentBiometricProfiles,
  studentPresenceEvents,
} from "@/db/schema";

import type {
  BiometricAssertionPayload,
} from "./biometric-assertion";
import type {
  FinalizePresenceResult,
} from "./finalize-presence";
import type {
  TerminalAccess,
} from "./terminal-auth";

import {
  getAttendanceScopeRejection,
  resolveAttendanceOperationalScope,
} from "./operational-scope";
export async function finalizeAuthorizedEarlyDeparture(
  access:
    TerminalAccess,
  attemptId:
    string,
  assertion:
    BiometricAssertionPayload,
): Promise<FinalizePresenceResult> {
  const db = getDb();

  const attemptRows =
    await db
      .select({
        id:
          attendanceVerificationAttempts.id,
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
        departureResult:
          attendanceVerificationAttempts.departureResult,
        outcome:
          attendanceVerificationAttempts.outcome,
        reasonCode:
          attendanceVerificationAttempts.reasonCode,
        manualVerifiedByMembershipId:
          attendanceVerificationAttempts.manualVerifiedByMembershipId,
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

  if (
    !attempt ||
    attempt.operation !==
      "CHECK_OUT" ||
    attempt.outcome !==
      "PENDING" ||
    attempt.cardResult !==
      "MATCHED" ||
    attempt.departureResult !==
      "EARLY" ||
    attempt.reasonCode !==
      null ||
    !attempt.studentId ||
    !attempt.cardId ||
    !attempt.manualVerifiedByMembershipId
  ) {
    return {
      ok: false,
      status: 409,
      code:
        "EARLY_DEPARTURE_NOT_FINALIZABLE",
      message:
        "The early departure is not ready for biometric finalization.",
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
        "Biometric evidence does not match this early departure.",
    };
  }

  const [
    authorizationRows,
    profileRows,
  ] =
    await db.batch([
      db
        .select({
          id:
            attendanceEarlyDepartureAuthorizations.id,
          attendanceRecordId:
            attendanceEarlyDepartureAuthorizations.attendanceRecordId,
          authorizedByMembershipId:
            attendanceEarlyDepartureAuthorizations.authorizedByMembershipId,
          passkeyGrantId:
            attendanceEarlyDepartureAuthorizations.passkeyGrantId,
          reason:
            attendanceEarlyDepartureAuthorizations.reason,
        })
        .from(
          attendanceEarlyDepartureAuthorizations,
        )
        .where(
          and(
            eq(
              attendanceEarlyDepartureAuthorizations.schoolId,
              access.school.id,
            ),
            eq(
              attendanceEarlyDepartureAuthorizations.attemptId,
              attempt.id,
            ),
            eq(
              attendanceEarlyDepartureAuthorizations.studentId,
              attempt.studentId,
            ),
            eq(
              attendanceEarlyDepartureAuthorizations.authorizedByMembershipId,
              attempt.manualVerifiedByMembershipId,
            ),
          ),
        )
        .limit(1),
      db
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
        .limit(1),
    ]);

  const authorization =
    authorizationRows[0];

  const profile =
    profileRows[0];

  if (!authorization) {
    return {
      ok: false,
      status: 409,
      code:
        "EARLY_DEPARTURE_AUTHORIZATION_REQUIRED",
      message:
        "A valid staff authorization is required.",
    };
  }

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
      "CHECK_OUT",
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

  await db.execute(sql`
    with candidate as (
      select
        a.id,
        a.school_id,
        a.session_id,
        a.terminal_id,
        a.student_id,
        a.card_id,
        auth.attendance_record_id,
        auth.authorized_by_membership_id,
        auth.passkey_grant_id,
        auth.reason
      from attendance_verification_attempts a
      join attendance_early_departure_authorizations auth
        on auth.school_id =
          a.school_id
        and auth.attempt_id =
          a.id
        and auth.student_id =
          a.student_id
        and auth.authorized_by_membership_id =
          a.manual_verified_by_membership_id
      join auth_passkey_step_up_grants pg
        on pg.id =
          auth.passkey_grant_id
        and pg.school_id =
          a.school_id
        and pg.membership_id =
          auth.authorized_by_membership_id
        and pg.action =
          'EARLY_DEPARTURE'
        and pg.consumed_at is not null
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
          'EARLY'::attendance_departure_result
        and a.reason_code is null
        and a.manual_verified_by_membership_id is not null
    ),
    updated_record as (
      update student_attendance_records r
      set
        presence_state =
          'SIGNED_OUT'::attendance_presence_state,
        departure_result =
          'EARLY'::attendance_departure_result,
        checked_out_at =
          ${now}::timestamptz,
        check_out_attempt_id =
          candidate.id,
        check_out_terminal_id =
          candidate.terminal_id,
        check_out_card_id =
          candidate.card_id,
        check_out_verified_by_membership_id =
          candidate.authorized_by_membership_id,
        check_out_reason =
          candidate.reason
      from candidate
      where
        r.school_id =
          candidate.school_id
        and r.id =
          candidate.attendance_record_id
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
        r.check_out_card_id,
        r.check_out_verified_by_membership_id,
        r.check_out_reason
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
          where
            e.attempt_id =
              a.id
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
        actor_membership_id,
        reason,
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
        'EARLY'::attendance_departure_result,
        r.check_out_verified_by_membership_id,
        r.check_out_reason,
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
      'STUDENT_EARLY_DEPARTURE'::school_notification_event_type,
      recipients.recipient_phone,
      'student_early_departure',
      jsonb_build_object(
        'studentName',
          recipients.student_name,
        'casaStudentId',
          recipients.casa_student_id,
        'signedOutAt',
          recipients.occurred_at,
        'message',
          recipients.student_name ||
          ' has signed out of school early with authorized staff approval.'
      ),
      'PENDING'::school_notification_delivery_status,
      0,
      ${now}::timestamptz,
      ${now}::timestamptz,
      ${now}::timestamptz
    from recipients
    on conflict do nothing
  `);

  const finalRows =
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
    finalRows[0]?.outcome !==
      "RECORDED"
  ) {
    return {
      ok: false,
      status: 409,
      code:
        "EARLY_DEPARTURE_FINALIZATION_CONFLICT",
      message:
        "Presence changed before the authorized early departure completed.",
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
          eq(
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
      "Authorized early-departure attendance record was not found.",
    );
  }

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
            "CHECKED_OUT",
          ),
        ),
      )
      .limit(1);

  const event =
    eventRows[0];

  if (!event) {
    throw new Error(
      "Authorized early-departure presence event was not found.",
    );
  }

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
          'STUDENT_EARLY_DEPARTURE'::school_notification_event_type
    `);

  const outboxRow =
    Array.isArray(outboxRows)
      ? outboxRows[0]
      : null;

  return {
    ok: true,
    replayed: false,
    operation:
      "CHECK_OUT",
    attendanceRecordId:
      record.id,
    presenceEventId:
      event.id,
    notificationQueued:
      Number(
        (
          outboxRow as
            | {
                count?: unknown;
              }
            | undefined
        )?.count ?? 0,
      ),
  };
}