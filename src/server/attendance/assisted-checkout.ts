import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";
import {
  consumePasskeyStepUpGrantWithId,
} from "@/server/auth/passkey-step-up";
import {
  queueGuardianPresencePushBestEffort,
} from "@/server/messaging/guardian-presence-push";

import {
  countInstructionalGraceDays,
} from "./card-replacement";
import {
  getSchoolClock,
} from "./terminal-session";

function rowsOf<T>(
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

export class AssistedCheckoutError
  extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name =
      "AssistedCheckoutError";
  }
}

export async function recordAssistedCheckout(
  input: {
    access: SchoolAccess;
    studentId: string;
    reason: string;
    confirmStudentFaceMatch: true;
    stepUpToken:
      string | null | undefined;
  },
) {
  const reason =
    input.reason.trim();

  if (
    reason.length < 3 ||
    reason.length > 240
  ) {
    throw new AssistedCheckoutError(
      "Enter a sign-out reason between 3 and 240 characters.",
      400,
      "ASSISTED_CHECKOUT_REASON_REQUIRED",
    );
  }

  if (
    input.confirmStudentFaceMatch !==
    true
  ) {
    throw new AssistedCheckoutError(
      "Staff must confirm that the student is physically present and matches the existing enrolled face profile.",
      400,
      "ASSISTED_CHECKOUT_FACE_CONFIRMATION_REQUIRED",
    );
  }

  const clock =
    getSchoolClock(
      new Date(),
      input.access.school.timezone,
    );

  const db =
    getDb();

  const candidate =
    rowsOf<{
      attendance_record_id:
        string;
      session_id:
        string;
      branch_id:
        string | null;
      branch_status:
        string;
      branch_mode:
        string;
      normal_dismissal_at:
        string | null;
      check_out_closes_at:
        string | null;
      active_card_count:
        number;
      active_face_count:
        number;
      first_card_pending_count:
        number;
      replacement_case_id:
        string | null;
      replacement_payment_status:
        "UNPAID" | "PAID" | null;
      replacement_reported_lost_on:
        string | null;
      attendance_status:
        string;
      verified_by_membership_id:
        string | null;
    }>(
      await db.execute(sql`
        select
          record.id::text
            as attendance_record_id,
          record.session_id::text
            as session_id,
          branch_map.branch_id::text
            as branch_id,
          coalesce(
            branch_session.status::text,
            session.status::text
          ) as branch_status,
          coalesce(
            branch_session.mode::text,
            'INSTRUCTIONAL'
          ) as branch_mode,
          day.normal_dismissal_at::text
            as normal_dismissal_at,
          day.check_out_closes_at::text
            as check_out_closes_at,
          (
            select count(*)::int
            from student_identity_cards card
            where
              card.school_id =
                record.school_id
              and card.student_id =
                record.student_id
              and card.status =
                'ACTIVE'::student_identity_card_status
          ) as active_card_count,
          (
            select count(*)::int
            from student_biometric_profiles profile
            where
              profile.school_id =
                record.school_id
              and profile.student_id =
                record.student_id
              and profile.status =
                'ACTIVE'::student_biometric_profile_status
          ) as active_face_count,
          (
            select count(*)::int
            from student_identity_cards card
            where
              card.school_id =
                record.school_id
              and card.student_id =
                record.student_id
              and card.status =
                'READY_FOR_ACTIVATION'::student_identity_card_status
          ) as first_card_pending_count,
          (
            select replacement.id::text
            from student_card_replacement_cases
              replacement
            where
              replacement.school_id =
                record.school_id
              and replacement.student_id =
                record.student_id
              and replacement.status =
                'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
            order by
              replacement.created_at desc
            limit 1
          ) as replacement_case_id,
          (
            select replacement.payment_status::text
            from student_card_replacement_cases
              replacement
            where
              replacement.school_id =
                record.school_id
              and replacement.student_id =
                record.student_id
              and replacement.status =
                'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
            order by
              replacement.created_at desc
            limit 1
          ) as replacement_payment_status,
          (
            select replacement.reported_lost_on::text
            from student_card_replacement_cases
              replacement
            where
              replacement.school_id =
                record.school_id
              and replacement.student_id =
                record.student_id
              and replacement.status =
                'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
            order by
              replacement.created_at desc
            limit 1
          ) as replacement_reported_lost_on,
          record.status::text
            as attendance_status,
          record.verified_by_membership_id::text
            as verified_by_membership_id
        from student_attendance_records
          record
        join attendance_sessions
          session
          on session.school_id =
             record.school_id
         and session.id =
             record.session_id
        join lateral (
          select enrollment.class_arm_id
          from student_enrollments
            enrollment
          where
            enrollment.school_id =
              record.school_id
            and enrollment.student_id =
              record.student_id
            and enrollment.status =
              'ACTIVE'::student_enrollment_status
            and enrollment.starts_on <=
              ${clock.date}::date
            and (
              enrollment.ends_on is null
              or enrollment.ends_on >=
                 ${clock.date}::date
            )
          order by
            enrollment.starts_on desc,
            enrollment.created_at desc
          limit 1
        ) enrollment
          on true
        left join school_branch_class_arms
          branch_map
          on branch_map.school_id =
             record.school_id
         and branch_map.class_arm_id =
             enrollment.class_arm_id
        left join attendance_branch_sessions
          branch_session
          on branch_session.school_id =
             record.school_id
         and branch_session.session_id =
             record.session_id
         and branch_session.branch_id =
             branch_map.branch_id
        left join attendance_policy_days
          day
          on day.school_id =
             record.school_id
         and day.policy_id =
             coalesce(
               branch_session.policy_id,
               session.policy_id
             )
         and day.weekday =
             ${clock.weekday}
        where
          record.school_id =
            ${input.access.school.id}::uuid
          and record.student_id =
            ${input.studentId}::uuid
          and session.attendance_date =
            ${clock.date}::date
          and record.presence_state =
            'ON_CAMPUS'::attendance_presence_state
          and record.checked_out_at
            is null
        limit 1
      `),
    )[0];

  if (!candidate) {
    throw new AssistedCheckoutError(
      "The student is not currently recorded as on campus today.",
      409,
      "ASSISTED_CHECKOUT_ON_CAMPUS_REQUIRED",
    );
  }

  if (!candidate.branch_id) {
    throw new AssistedCheckoutError(
      "The student has no authoritative campus assignment for today.",
      409,
      "ASSISTED_CHECKOUT_BRANCH_REQUIRED",
    );
  }

  if (
    ![
      "OPEN",
      "CLOSED",
    ].includes(
      candidate.branch_status,
    )
  ) {
    throw new AssistedCheckoutError(
      "Today's campus attendance session is not available for sign-out.",
      409,
      "ASSISTED_CHECKOUT_SESSION_UNAVAILABLE",
    );
  }

  if (
    Number(
      candidate.active_card_count ??
      0,
    ) > 0
  ) {
    throw new AssistedCheckoutError(
      "This student has an active CASA card. Use the normal Scanner checkout flow.",
      409,
      "ASSISTED_CHECKOUT_ACTIVE_CARD_USE_SCANNER",
    );
  }

  if (
    Number(
      candidate.active_face_count ??
      0,
    ) < 1
  ) {
    throw new AssistedCheckoutError(
      "An ACTIVE existing biometric profile is required for assisted sign-out.",
      409,
      "ACTIVE_BIOMETRIC_PROFILE_REQUIRED",
    );
  }

  if (
    candidate.replacement_case_id
  ) {
    const paymentStatus =
      candidate
        .replacement_payment_status;

    if (
      paymentStatus !== "UNPAID" &&
      paymentStatus !== "PAID"
    ) {
      throw new AssistedCheckoutError(
        "The pending card-replacement payment state could not be verified.",
        409,
        "CARD_REPLACEMENT_STATE_CHANGED",
      );
    }

    if (
      paymentStatus === "UNPAID"
    ) {
      const reportedLostOn =
        candidate
          .replacement_reported_lost_on;

      if (!reportedLostOn) {
        throw new AssistedCheckoutError(
          "The pending card-replacement grace start date could not be verified.",
          409,
          "CARD_REPLACEMENT_STATE_CHANGED",
        );
      }

      const graceDayNumber =
        await countInstructionalGraceDays({
          schoolId:
            input.access.school.id,
          branchId:
            candidate.branch_id,
          startsOn:
            reportedLostOn,
          endsOn:
            clock.date,
        });

      if (
        graceDayNumber < 1
      ) {
        throw new AssistedCheckoutError(
          "Today is not an instructional grace day for this replacement case.",
          409,
          "CARD_REPLACEMENT_NOT_INSTRUCTIONAL_DAY",
        );
      }

      if (
        graceDayNumber > 3
      ) {
        throw new AssistedCheckoutError(
          "The three-instructional-day card replacement grace period has expired. Replacement payment must be recorded before assisted attendance can continue.",
          409,
          "CARD_REPLACEMENT_PAYMENT_REQUIRED",
        );
      }
    }
  }

  const grantId =
    input.stepUpToken
      ? await consumePasskeyStepUpGrantWithId({
          token:
            input.stepUpToken,
          access:
            input.access,
          action:
            "ASSISTED_CHECK_OUT",
        })
      : null;

  if (!grantId) {
    throw new AssistedCheckoutError(
      "Passkey authorization is required for assisted sign-out.",
      403,
      "PASSKEY_STEP_UP_REQUIRED",
    );
  }

  const departureResult:
    | "EARLY"
    | "NORMAL" =
      candidate.branch_mode ===
        "PRESENCE_ONLY" ||
      !candidate.normal_dismissal_at ||
      clock.clock >=
        candidate.normal_dismissal_at.slice(
          0,
          5,
        )
        ? "NORMAL"
        : "EARLY";

  const now =
    new Date().toISOString();

  const result =
    await db.execute(sql`
      with updated_record as (
        update student_attendance_records
          record
        set
          presence_state =
            'SIGNED_OUT'::attendance_presence_state,
          departure_result =
            ${departureResult}::attendance_departure_result,
          checked_out_at =
            ${now}::timestamptz,
          check_out_attempt_id =
            null,
          check_out_terminal_id =
            null,
          check_out_card_id =
            null,
          check_out_verified_by_membership_id =
            ${input.access.membership.id}::uuid,
          check_out_reason =
            ${reason}
        where
          record.school_id =
            ${input.access.school.id}::uuid
          and record.id =
            ${candidate.attendance_record_id}::uuid
          and record.student_id =
            ${input.studentId}::uuid
          and record.presence_state =
            'ON_CAMPUS'::attendance_presence_state
          and record.checked_out_at
            is null
        returning
          record.id,
          record.school_id,
          record.session_id,
          record.student_id,
          record.checked_out_at,
          record.departure_result
      ),
      closed_attempts as (
        update attendance_verification_attempts
          attempt
        set
          outcome =
            'REJECTED'::attendance_attempt_outcome,
          reason_code =
            'ASSISTED_CHECKOUT_COMPLETED',
          manual_verified_by_membership_id =
            ${input.access.membership.id}::uuid,
          completed_at =
            ${now}::timestamptz
        from updated_record
          record
        where
          attempt.school_id =
            record.school_id
          and attempt.session_id =
            record.session_id
          and attempt.student_id =
            record.student_id
          and attempt.operation =
            'CHECK_OUT'::attendance_operation
          and attempt.outcome =
            'PENDING'::attendance_attempt_outcome
        returning
          attempt.id,
          attempt.school_id
      ),
      closed_liveness as (
        update biometric_liveness_sessions
          liveness
        set
          status = 'FAILED',
          failure_code =
            'ASSISTED_CHECKOUT_COMPLETED',
          updated_at =
            ${now}::timestamptz
        where
          liveness.school_id =
            ${input.access.school.id}::uuid
          and liveness.purpose =
            'VERIFICATION'
          and liveness.status =
            'CREATED'
          and exists (
            select 1
            from closed_attempts
              attempt
            where
              attempt.school_id =
                liveness.school_id
              and attempt.id =
                liveness.attempt_id
          )
        returning
          liveness.id
      ),
      revoked_early_preauth as (
        update attendance_early_departure_preauthorizations
          preauth
        set
          revoked_at =
            ${now}::timestamptz
        from updated_record
          record
        where
          preauth.school_id =
            record.school_id
          and preauth.session_id =
            record.session_id
          and preauth.student_id =
            record.student_id
          and preauth.consumed_attempt_id
            is null
          and preauth.revoked_at
            is null
        returning
          preauth.id
      ),
      consumed_after_hours as (
        update attendance_late_stay_authorizations
          authorization
        set
          consumed_at =
            ${now}::timestamptz,
          updated_at =
            ${now}::timestamptz
        from updated_record
          record
        where
          authorization.school_id =
            record.school_id
          and authorization.session_id =
            record.session_id
          and authorization.student_id =
            record.student_id
          and authorization.consumed_at
            is null
          and authorization.revoked_at
            is null
        returning
          authorization.id
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
          record.school_id,
          record.session_id,
          record.student_id,
          record.id,
          null,
          null,
          null,
          'CHECKED_OUT'::attendance_presence_event_type,
          ${departureResult}::attendance_departure_result,
          ${input.access.membership.id}::uuid,
          ${reason},
          ${now}::timestamptz,
          ${now}::timestamptz
        from updated_record
          record
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
          sender.id,
          sender.school_id
        from school_whatsapp_senders
          sender
        where
          sender.school_id =
            ${input.access.school.id}::uuid
          and sender.status =
            'ACTIVE'::school_messaging_sender_status
        limit 1
      ),
      recipients as (
        select
          event.id
            as presence_event_id,
          event.school_id,
          event.student_id,
          event.attendance_record_id,
          event.occurred_at,
          sender.id
            as sender_id,
          guardian.id
            as guardian_id,
          guardian.phone
            as recipient_phone,
          student.casa_student_id,
          concat_ws(
            ' ',
            student.first_name,
            nullif(
              student.middle_name,
              ''
            ),
            student.last_name
          ) as student_name
        from inserted_event
          event
        join active_sender
          sender
          on sender.school_id =
             event.school_id
        join student_guardians
          relationship
          on relationship.school_id =
             event.school_id
         and relationship.student_id =
             event.student_id
         and relationship.receives_notifications =
             true
        join guardians
          guardian
          on guardian.school_id =
             relationship.school_id
         and guardian.id =
             relationship.guardian_id
         and guardian.status =
             'ACTIVE'::guardian_status
         and guardian.phone
             is not null
         and length(
           trim(
             guardian.phone
           )
         ) > 0
        join students
          student
          on student.school_id =
             event.school_id
         and student.id =
             event.student_id
      ),
      queued as (
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
          case
            when ${departureResult} =
              'EARLY'
              then
                'STUDENT_EARLY_DEPARTURE'::school_notification_event_type
            else
                'STUDENT_SIGNED_OUT'::school_notification_event_type
          end,
          recipients.recipient_phone,
          case
            when ${departureResult} =
              'EARLY'
              then
                'student_early_departure'
            else
                'student_signed_out'
          end,
          jsonb_build_object(
            'studentName',
              recipients.student_name,
            'casaStudentId',
              recipients.casa_student_id,
            'signedOutAt',
              recipients.occurred_at,
            'attendanceMethod',
              'ASSISTED_NO_ACTIVE_CARD',
            'departureResult',
              ${departureResult},
            'message',
              case
                when ${departureResult} =
                  'EARLY'
                  then
                    recipients.student_name ||
                    ' has checked out of school early through supervised assisted sign-out.'
                else
                    recipients.student_name ||
                    ' has signed out of school through supervised assisted sign-out.'
              end
          ),
          'PENDING'::school_notification_delivery_status,
          0,
          ${now}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        from recipients
        on conflict do nothing
        returning
          id
      )
      select
        record.id
          as attendance_record_id,
        event.id
          as presence_event_id,
        record.checked_out_at,
        record.departure_result::text
          as departure_result,
        (
          select count(*)::int
          from queued
        ) as guardian_notifications_queued
      from updated_record
        record
      join inserted_event
        event
        on event.attendance_record_id =
           record.id
    `);

  const row =
    rowsOf<{
      attendance_record_id:
        string;
      presence_event_id:
        string;
      checked_out_at:
        string | Date;
      departure_result:
        "EARLY" | "NORMAL";
      guardian_notifications_queued:
        number;
    }>(
      result,
    )[0];

  if (!row) {
    throw new AssistedCheckoutError(
      "Attendance changed before assisted sign-out could complete.",
      409,
      "ASSISTED_CHECKOUT_STATE_CHANGED",
    );
  }

  const guardianPushQueued =
    await queueGuardianPresencePushBestEffort({
      schoolId:
        input.access.school.id,
      studentId:
        input.studentId,
      attendanceRecordId:
        row.attendance_record_id,
      presenceEventId:
        row.presence_event_id,
      eventType:
        row.departure_result ===
          "EARLY"
          ? "STUDENT_EARLY_DEPARTURE"
          : "STUDENT_SIGNED_OUT",
    });

  return {
    ok: true as const,
    attendanceRecordId:
      row.attendance_record_id,
    presenceEventId:
      row.presence_event_id,
    checkedOutAt:
      row.checked_out_at,
    departureResult:
      row.departure_result,
    guardianNotificationsQueued:
      Number(
        row.guardian_notifications_queued ??
        0,
      ),
    guardianPushQueued,
    verificationMethod:
      "FACE_EXISTING_PROFILE_STAFF_CONFIRMED" as const,
    passkeyGrantId:
      grantId,
  };
}
