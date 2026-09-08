import { sql } from "drizzle-orm";

import { getDb } from "@/db";
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

function rowsOf<T>(
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(
      (result as {
        rows?: unknown;
      }).rows,
    )
  ) {
    return (result as {
      rows: T[];
    }).rows;
  }

  return [];
}

export class CardReplacementAttendanceError
  extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name =
      "CardReplacementAttendanceError";
  }
}

export type CardExceptionVerificationMethod =
  "FACE_EXISTING_PROFILE";

function datePlusDays(
  date: string,
  days: number,
): string {
  const value =
    new Date(
      `${date}T00:00:00.000Z`,
    );

  value.setUTCDate(
    value.getUTCDate() +
      days,
  );

  return value
    .toISOString()
    .slice(0, 10);
}

export async function getPendingCardReplacementCase(
  input: {
    schoolId: string;
    studentId: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        c.id,
        c.student_id,
        c.lost_card_id,
        c.status::text as status,
        c.reported_lost_on::text
          as reported_lost_on,
        c.reported_lost_at,
        c.reason,
        c.replacement_requested_at,
        c.replacement_requested_by_membership_id,
        c.replacement_card_id,
        c.created_at,
        c.updated_at
      from student_card_replacement_cases c
      where
        c.school_id =
          ${input.schoolId}::uuid
        and c.student_id =
          ${input.studentId}::uuid
        and c.status =
          'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
      limit 1
    `);

  return rowsOf(result)[0] ??
    null;
}

export async function reportStudentCardLost(
  input: {
    access: SchoolAccess;
    studentId: string;
    reason?: string | null;
  },
) {
  const existing =
    await getPendingCardReplacementCase({
      schoolId:
        input.access.school.id,
      studentId:
        input.studentId,
    });

  if (existing) {
    return {
      case: existing,
      created: false,
    };
  }

  const clock =
    getSchoolClock(
      new Date(),
      input.access.school.timezone,
    );

  const db = getDb();

  const result =
    await db.execute(sql`
      with active_card as (
        select
          card.id
        from student_identity_cards card
        join students student
          on student.school_id =
             card.school_id
         and student.id =
             card.student_id
        where
          card.school_id =
            ${input.access.school.id}::uuid
          and card.student_id =
            ${input.studentId}::uuid
          and card.status =
            'ACTIVE'::student_identity_card_status
          and student.status =
            'ACTIVE'::student_status
        order by
          card.issued_at desc,
          card.created_at desc
        limit 1
        for update of card
      ),
      lost_card as (
        update student_identity_cards card
        set
          status =
            'LOST'::student_identity_card_status,
          deactivated_at = now(),
          updated_at = now()
        from active_card active
        where
          card.school_id =
            ${input.access.school.id}::uuid
          and card.id =
            active.id
          and card.status =
            'ACTIVE'::student_identity_card_status
        returning
          card.id,
          card.school_id,
          card.student_id
      ),
      lifecycle_event as (
        insert into student_identity_card_events (
          school_id,
          student_id,
          card_id,
          actor_membership_id,
          actor_kind,
          event_type,
          reason,
          created_at
        )
        select
          lost.school_id,
          lost.student_id,
          lost.id,
          ${input.access.membership.id}::uuid,
          'SCHOOL_MEMBER',
          'MARKED_LOST'::student_identity_card_event_type,
          ${input.reason ?? null},
          now()
        from lost_card lost
        returning id
      ),
      replacement_case as (
        insert into student_card_replacement_cases (
          id,
          school_id,
          student_id,
          lost_card_id,
          status,
          reported_lost_on,
          reported_lost_at,
          reported_by_membership_id,
          reason,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          lost.school_id,
          lost.student_id,
          lost.id,
          'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status,
          ${clock.date}::date,
          now(),
          ${input.access.membership.id}::uuid,
          ${input.reason ?? null},
          now(),
          now()
        from lost_card lost
        returning *
      )
      select
        id,
        student_id,
        lost_card_id,
        status::text as status,
        reported_lost_on::text
          as reported_lost_on,
        reported_lost_at,
        reason,
        replacement_requested_at,
        replacement_requested_by_membership_id,
        replacement_card_id,
        created_at,
        updated_at
      from replacement_case
    `);

  const replacementCase =
    rowsOf(result)[0];

  if (!replacementCase) {
    throw new CardReplacementAttendanceError(
      "The student has no ACTIVE card that can be reported lost.",
      409,
      "ACTIVE_CARD_REQUIRED",
    );
  }

  return {
    case:
      replacementCase,
    created: true,
  };
}

export async function requestStudentCardReplacement(
  input: {
    access: SchoolAccess;
    studentId: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      update student_card_replacement_cases
      set
        replacement_requested_at =
          coalesce(
            replacement_requested_at,
            now()
          ),
        replacement_requested_by_membership_id =
          coalesce(
            replacement_requested_by_membership_id,
            ${input.access.membership.id}::uuid
          ),
        updated_at = now()
      where
        school_id =
          ${input.access.school.id}::uuid
        and student_id =
          ${input.studentId}::uuid
        and status =
          'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
      returning
        id,
        student_id,
        lost_card_id,
        status::text as status,
        reported_lost_on::text
          as reported_lost_on,
        reported_lost_at,
        reason,
        replacement_requested_at,
        replacement_requested_by_membership_id,
        replacement_card_id,
        created_at,
        updated_at
    `);

  const replacementCase =
    rowsOf(result)[0];

  if (!replacementCase) {
    throw new CardReplacementAttendanceError(
      "No pending card replacement case exists for this student.",
      404,
      "CARD_REPLACEMENT_CASE_NOT_FOUND",
    );
  }

  return replacementCase;
}

async function resolveStudentBranch(
  input: {
    schoolId: string;
    studentId: string;
    date: string;
  },
): Promise<string> {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        mapping.branch_id
      from student_enrollments enrollment
      join students student
        on student.school_id =
           enrollment.school_id
       and student.id =
           enrollment.student_id
      join school_branch_class_arms mapping
        on mapping.school_id =
           enrollment.school_id
       and mapping.class_arm_id =
           enrollment.class_arm_id
      where
        enrollment.school_id =
          ${input.schoolId}::uuid
        and enrollment.student_id =
          ${input.studentId}::uuid
        and enrollment.status =
          'ACTIVE'::student_enrollment_status
        and student.status =
          'ACTIVE'::student_status
        and enrollment.starts_on <=
          ${input.date}::date
        and (
          enrollment.ends_on is null
          or enrollment.ends_on >=
             ${input.date}::date
        )
      order by
        enrollment.starts_on desc,
        enrollment.created_at desc
      limit 1
    `);

  const row =
    rowsOf<{
      branch_id:
        string;
    }>(result)[0];

  if (!row?.branch_id) {
    throw new CardReplacementAttendanceError(
      "The student has no authoritative active branch enrollment for today.",
      409,
      "STUDENT_BRANCH_ENROLLMENT_REQUIRED",
    );
  }

  return row.branch_id;
}

async function countInstructionalGraceDays(
  input: {
    schoolId: string;
    branchId: string;
    startsOn: string;
    endsOn: string;
  },
): Promise<number> {
  if (
    input.endsOn <
      input.startsOn
  ) {
    return 0;
  }

  let date =
    input.startsOn;
  let count = 0;

  for (
    let guard = 0;
    guard < 370 &&
    date <= input.endsOn;
    guard += 1
  ) {
    if (
      await isInstructionalDate({
        schoolId:
          input.schoolId,
        branchId:
          input.branchId,
        date,
      })
    ) {
      count += 1;
    }

    date =
      datePlusDays(
        date,
        1,
      );
  }

  return count;
}

async function requireOpenInstructionalSession(
  input: {
    access: SchoolAccess;
    studentId: string;
  },
) {
  const clock =
    getSchoolClock(
      new Date(),
      input.access.school.timezone,
    );

  const readiness =
    await getAttendanceReadinessRejection({
      schoolId:
        input.access.school.id,
      date:
        clock.date,
    });

  if (readiness) {
    throw new CardReplacementAttendanceError(
      "School attendance is not active for this date.",
      readiness.status,
      readiness.code,
    );
  }

  const branchId =
    await resolveStudentBranch({
      schoolId:
        input.access.school.id,
      studentId:
        input.studentId,
      date:
        clock.date,
    });

  const db = getDb();

  const result =
    await db.execute(sql`
      select
        session.id,
        session.policy_id,
        session.attendance_date::text
          as attendance_date
      from attendance_sessions session
      join attendance_policy_days day
        on day.school_id =
           session.school_id
       and day.policy_id =
           session.policy_id
       and day.weekday =
           ${clock.weekday}
      where
        session.school_id =
          ${input.access.school.id}::uuid
        and session.attendance_date =
          ${clock.date}::date
        and session.status =
          'OPEN'::attendance_session_status
        and not exists (
          select 1
          from school_calendar_events event
          where
            event.school_id =
              session.school_id
            and event.starts_on <=
              session.attendance_date
            and event.ends_on >=
              session.attendance_date
            and (
              event.branch_id is null
              or event.branch_id =
                 ${branchId}::uuid
            )
        )
      limit 1
    `);

  const session =
    rowsOf<{
      id: string;
      policy_id: string;
      attendance_date:
        string;
    }>(result)[0];

  if (!session) {
    throw new CardReplacementAttendanceError(
      "No open instructional attendance session exists for this student today.",
      409,
      "OPEN_INSTRUCTIONAL_ATTENDANCE_SESSION_REQUIRED",
    );
  }

  return {
    clock,
    branchId,
    session,
  };
}

async function requireExceptionIdentityVerification(
  input: {
    access: SchoolAccess;
    studentId: string;
    verificationMethod:
      CardExceptionVerificationMethod;
  },
) {
  const db = getDb();
  const result =
    await db.execute(sql`
      select id
      from student_biometric_profiles
      where
        school_id =
          ${input.access.school.id}::uuid
        and student_id =
          ${input.studentId}::uuid
        and status =
          'ACTIVE'::student_biometric_profile_status
      limit 1
    `);

  if (
    rowsOf(result).length ===
      0
  ) {
    throw new CardReplacementAttendanceError(
      "An ACTIVE existing biometric profile is required for FACE_EXISTING_PROFILE verification.",
      409,
      "ACTIVE_BIOMETRIC_PROFILE_REQUIRED",
    );
  }
}

export async function recordCardReplacementAttendanceException(
  input: {
    access: SchoolAccess;
    studentId: string;
    verificationMethod:
      CardExceptionVerificationMethod;
  },
) {
  const {
    clock,
    branchId,
    session,
  } =
    await requireOpenInstructionalSession({
      access:
        input.access,
      studentId:
        input.studentId,
    });

  const replacementCase =
    await getPendingCardReplacementCase({
      schoolId:
        input.access.school.id,
      studentId:
        input.studentId,
    }) as {
      id: string;
      reported_lost_on:
        string;
      replacement_requested_at:
        Date | string | null;
    } | null;

  if (!replacementCase) {
    throw new CardReplacementAttendanceError(
      "The student is not in CARD_REPLACEMENT_PENDING state.",
      409,
      "CARD_REPLACEMENT_PENDING_REQUIRED",
    );
  }

  const replacementRequested =
    Boolean(
      replacementCase
        .replacement_requested_at,
    );

  let graceDayNumber:
    number | null =
      null;

  if (!replacementRequested) {
    graceDayNumber =
      await countInstructionalGraceDays({
        schoolId:
          input.access.school.id,
        branchId,
        startsOn:
          replacementCase
            .reported_lost_on,
        endsOn:
          clock.date,
      });

    if (
      graceDayNumber < 1
    ) {
      throw new CardReplacementAttendanceError(
        "Today is not an instructional grace day for this replacement case.",
        409,
        "CARD_REPLACEMENT_NOT_INSTRUCTIONAL_DAY",
      );
    }

    if (
      graceDayNumber > 3
    ) {
      throw new CardReplacementAttendanceError(
        "The three-instructional-day card replacement grace period expired without a formal replacement request.",
        409,
        "CARD_REPLACEMENT_GRACE_EXPIRED",
      );
    }
  }

  await requireExceptionIdentityVerification({
    access:
      input.access,
    studentId:
      input.studentId,
    verificationMethod:
      input.verificationMethod,
  });

  const db = getDb();

  const existing =
    await db.execute(sql`
      select id
      from student_attendance_records
      where
        school_id =
          ${input.access.school.id}::uuid
        and session_id =
          ${session.id}::uuid
        and student_id =
          ${input.studentId}::uuid
      limit 1
    `);

  if (
    rowsOf(existing).length >
      0
  ) {
    throw new CardReplacementAttendanceError(
      "Attendance has already been recorded for this student today.",
      409,
      "ATTENDANCE_ALREADY_RECORDED",
    );
  }

  const reason =
    "CARD_REPLACEMENT_PENDING";

  const result =
    await db.execute(sql`
      with inserted_record as (
        insert into student_attendance_records (
          school_id,
          session_id,
          student_id,
          terminal_id,
          card_id,
          source_attempt_id,
          status,
          verified_by_membership_id,
          presence_state,
          departure_result,
          recorded_at,
          created_at
        )
        values (
          ${input.access.school.id}::uuid,
          ${session.id}::uuid,
          ${input.studentId}::uuid,
          null,
          null,
          null,
          'MANUAL'::attendance_record_status,
          ${input.access.membership.id}::uuid,
          'ON_CAMPUS'::attendance_presence_state,
          'NOT_RUN'::attendance_departure_result,
          now(),
          now()
        )
        on conflict (
          school_id,
          session_id,
          student_id
        )
        do nothing
        returning
          id,
          school_id,
          session_id,
          student_id,
          recorded_at
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
          'CHECKED_IN'::attendance_presence_event_type,
          'NOT_RUN'::attendance_departure_result,
          ${input.access.membership.id}::uuid,
          ${reason},
          record.recorded_at,
          now()
        from inserted_record record
        returning
          id,
          school_id,
          student_id,
          attendance_record_id,
          occurred_at
      ),
      inserted_exception as (
        insert into student_card_attendance_exceptions (
          id,
          school_id,
          case_id,
          student_id,
          session_id,
          attendance_record_id,
          verified_by_membership_id,
          verification_method,
          grace_day_number,
          replacement_requested,
          created_at
        )
        select
          gen_random_uuid(),
          record.school_id,
          ${replacementCase.id}::uuid,
          record.student_id,
          record.session_id,
          record.id,
          ${input.access.membership.id}::uuid,
          ${input.verificationMethod}::student_card_attendance_exception_verification,
          ${graceDayNumber},
          ${replacementRequested},
          now()
        from inserted_record record
        returning *
      ),
      active_sender as (
        select
          sender.id,
          sender.school_id
        from school_whatsapp_senders sender
        where
          sender.school_id =
            ${input.access.school.id}::uuid
          and sender.status =
            'ACTIVE'::school_messaging_sender_status
        limit 1
      ),
      recipients as (
        select
          event.id as presence_event_id,
          event.school_id,
          event.student_id,
          event.attendance_record_id,
          event.occurred_at,
          sender.id as sender_id,
          guardian.id as guardian_id,
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
        from inserted_event event
        join active_sender sender
          on sender.school_id =
             event.school_id
        join student_guardians mapping
          on mapping.school_id =
             event.school_id
         and mapping.student_id =
             event.student_id
         and mapping.receives_notifications =
             true
        join guardians guardian
          on guardian.school_id =
             mapping.school_id
         and guardian.id =
             mapping.guardian_id
         and guardian.status =
             'ACTIVE'::guardian_status
         and guardian.phone is not null
         and length(
           trim(guardian.phone)
         ) > 0
        join students student
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
          'STUDENT_CHECKED_IN'::school_notification_event_type,
          recipients.recipient_phone,
          'student_card_replacement_exception_checked_in',
          jsonb_build_object(
            'studentName',
              recipients.student_name,
            'casaStudentId',
              recipients.casa_student_id,
            'checkedInAt',
              recipients.occurred_at,
            'attendanceMethod',
              'CARD_REPLACEMENT_EXCEPTION',
            'replacementPending',
              true,
            'replacementRequested',
              ${replacementRequested},
            'graceDayNumber',
              ${graceDayNumber},
            'message',
              recipients.student_name ||
              ' has arrived at school through the card-replacement exception process.'
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
      select
        record.id
          as attendance_record_id,
        event.id
          as presence_event_id,
        exception.id
          as exception_id,
        (
          select count(*)::int
          from queued
        ) as guardian_notifications_queued
      from inserted_record record
      join inserted_event event
        on event.attendance_record_id =
           record.id
      join inserted_exception exception
        on exception.attendance_record_id =
           record.id
    `);

  const row =
    rowsOf<{
      attendance_record_id:
        string;
      presence_event_id:
        string;
      exception_id:
        string;
      guardian_notifications_queued:
        number;
    }>(result)[0];

  if (!row) {
    throw new CardReplacementAttendanceError(
      "Attendance changed before the card-replacement exception could be recorded.",
      409,
      "CARD_REPLACEMENT_EXCEPTION_STATE_CHANGED",
    );
  }

  return {
    attendanceRecordId:
      row.attendance_record_id,
    presenceEventId:
      row.presence_event_id,
    exceptionId:
      row.exception_id,
    arrivalStatus:
      "PRESENT_CARD_EXCEPTION" as const,
    attendanceRecordStatus:
      "MANUAL" as const,
    replacementRequested,
    graceDayNumber,
    verificationMethod:
      input.verificationMethod,
    guardianNotificationsQueued:
      Number(
        row.guardian_notifications_queued,
      ),
  };
}

export async function getStudentCardAttendanceCompliance(
  input: {
    access: SchoolAccess;
    studentId: string;
    fromDate: string;
    toDate: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        count(*)::int
          as attended_days,
        count(*) filter (
          where
            record.card_id is not null
            and record.source_attempt_id is not null
            and exception.id is null
        )::int
          as card_confirmed_attended_days,
        count(*) filter (
          where
            exception.id is not null
        )::int
          as card_exception_days
      from student_attendance_records record
      join attendance_sessions session
        on session.school_id =
           record.school_id
       and session.id =
           record.session_id
      left join student_card_attendance_exceptions exception
        on exception.school_id =
           record.school_id
       and exception.attendance_record_id =
           record.id
      where
        record.school_id =
          ${input.access.school.id}::uuid
        and record.student_id =
          ${input.studentId}::uuid
        and session.attendance_date >=
          ${input.fromDate}::date
        and session.attendance_date <=
          ${input.toDate}::date
    `);

  const row =
    rowsOf<{
      attended_days: number;
      card_confirmed_attended_days:
        number;
      card_exception_days:
        number;
    }>(result)[0];

  const attendedDays =
    Number(
      row?.attended_days ??
      0,
    );
  const cardConfirmedAttendedDays =
    Number(
      row
        ?.card_confirmed_attended_days ??
      0,
    );
  const cardExceptionDays =
    Number(
      row?.card_exception_days ??
      0,
    );

  return {
    attendedDays,
    cardConfirmedAttendedDays,
    cardExceptionDays,
    cardCompliancePercentage:
      attendedDays === 0
        ? null
        : Number(
            (
              (
                cardConfirmedAttendedDays /
                attendedDays
              ) *
              100
            ).toFixed(2),
          ),
    note:
      "Physical attendance remains authoritative. Card compliance measures card-confirmed arrivals among attended days; supervised replacement exceptions reduce compliance without converting presence into absence.",
  };
}
