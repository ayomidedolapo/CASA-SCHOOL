import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  requireSchoolAccess,
  type SchoolAccess,
} from "@/server/auth/authorization";
import {
  requireBranchAccess,
} from "@/server/school-operations/operations";

import {
  getAttendanceReadinessRejection,
} from "./readiness";
import {
  getSchoolClock,
} from "./terminal-session";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(
      (result as { rows?: unknown }).rows,
    )
  ) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

export class SupervisedArrivalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "SupervisedArrivalError";
  }
}

export type SupervisedFaceVerificationMethod =
  "FACE_EXISTING_PROFILE";

async function resolveStudentBranch(
  input: {
    schoolId: string;
    studentId: string;
    date: string;
  },
): Promise<string> {
  const db = getDb();
  const result = await db.execute(sql`
    select mapping.branch_id
    from student_enrollments enrollment
    join students student
      on student.school_id = enrollment.school_id
     and student.id = enrollment.student_id
    join school_branch_class_arms mapping
      on mapping.school_id = enrollment.school_id
     and mapping.class_arm_id = enrollment.class_arm_id
    join school_branches branch
      on branch.school_id = mapping.school_id
     and branch.id = mapping.branch_id
     and branch.status = 'ACTIVE'::school_branch_status
    where
      enrollment.school_id = ${input.schoolId}::uuid
      and enrollment.student_id = ${input.studentId}::uuid
      and enrollment.status = 'ACTIVE'::student_enrollment_status
      and student.status = 'ACTIVE'::student_status
      and enrollment.starts_on <= ${input.date}::date
      and (
        enrollment.ends_on is null
        or enrollment.ends_on >= ${input.date}::date
      )
    order by enrollment.starts_on desc, enrollment.created_at desc
    limit 1
  `);

  const branchId = rowsOf<{ branch_id: string }>(result)[0]?.branch_id;

  if (!branchId) {
    throw new SupervisedArrivalError(
      "The student has no authoritative active branch enrollment for today.",
      409,
      "STUDENT_BRANCH_ENROLLMENT_REQUIRED",
    );
  }

  return branchId;
}

export async function requireStudentBranchAttendanceAuthority(
  schoolSlug: string,
  studentId: string,
) {
  const access = await requireSchoolAccess(schoolSlug);
  const clock = getSchoolClock(
    new Date(),
    access.school.timezone,
  );
  const branchId = await resolveStudentBranch({
    schoolId: access.school.id,
    studentId,
    date: clock.date,
  });

  return requireBranchAccess(
    schoolSlug,
    branchId,
  );
}

async function requireAttendanceActive(
  access: SchoolAccess,
  date: string,
) {
  const readiness = await getAttendanceReadinessRejection({
    schoolId: access.school.id,
    date,
  });

  if (readiness) {
    throw new SupervisedArrivalError(
      "School attendance is not active for this date.",
      readiness.status,
      readiness.code,
    );
  }
}

async function requireActiveBiometricProfile(
  input: {
    access: SchoolAccess;
    studentId: string;
  },
) {
  const db = getDb();
  const result = await db.execute(sql`
    select id
    from student_biometric_profiles
    where
      school_id = ${input.access.school.id}::uuid
      and student_id = ${input.studentId}::uuid
      and status = 'ACTIVE'::student_biometric_profile_status
    limit 1
  `);

  if (rowsOf(result).length === 0) {
    throw new SupervisedArrivalError(
      "An ACTIVE existing biometric profile is required for supervised first-card attendance.",
      409,
      "ACTIVE_BIOMETRIC_PROFILE_REQUIRED",
    );
  }
}

async function requireOpenSessionWindow(
  input: {
    access: SchoolAccess;
    studentId: string;
    mode: "FIRST_CARD" | "LATE";
  },
) {
  const clock = getSchoolClock(
    new Date(),
    input.access.school.timezone,
  );

  await requireAttendanceActive(
    input.access,
    clock.date,
  );

  const branchId = await resolveStudentBranch({
    schoolId: input.access.school.id,
    studentId: input.studentId,
    date: clock.date,
  });

  const db = getDb();
  const result = await db.execute(sql`
    select
      session.id,
      session.policy_id,
      day.check_in_opens_at::text as check_in_opens_at,
      day.check_in_closes_at::text as check_in_closes_at,
      day.check_out_closes_at::text as check_out_closes_at
    from attendance_sessions session
    join attendance_policy_days day
      on day.school_id = session.school_id
     and day.policy_id = session.policy_id
     and day.weekday = ${clock.weekday}
    where
      session.school_id = ${input.access.school.id}::uuid
      and session.attendance_date = ${clock.date}::date
      and session.status = 'OPEN'::attendance_session_status
      and not exists (
        select 1
        from school_calendar_events event
        where
          event.school_id = session.school_id
          and event.starts_on <= session.attendance_date
          and event.ends_on >= session.attendance_date
          and (
            event.branch_id is null
            or event.branch_id = ${branchId}::uuid
          )
      )
    limit 1
  `);

  const session = rowsOf<{
    id: string;
    policy_id: string;
    check_in_opens_at: string;
    check_in_closes_at: string;
    check_out_closes_at: string;
  }>(result)[0];

  if (!session) {
    throw new SupervisedArrivalError(
      "No open instructional attendance session exists for this student today.",
      409,
      "OPEN_INSTRUCTIONAL_ATTENDANCE_SESSION_REQUIRED",
    );
  }

  const opensAt = session.check_in_opens_at.slice(0, 5);
  const closesAt = session.check_in_closes_at.slice(0, 5);
  const checkoutClosesAt = session.check_out_closes_at.slice(0, 5);

  if (
    input.mode === "FIRST_CARD" &&
    (clock.clock < opensAt || clock.clock > closesAt)
  ) {
    throw new SupervisedArrivalError(
      "First-card supervised attendance is only available during the normal check-in window. Use supervised late arrival after the window closes.",
      409,
      "FIRST_CARD_ATTENDANCE_WINDOW_REQUIRED",
    );
  }

  if (
    input.mode === "LATE" &&
    (
      clock.clock <= closesAt ||
      clock.clock > checkoutClosesAt
    )
  ) {
    throw new SupervisedArrivalError(
      "Supervised late arrival is only available after check-in closes and before the attendance checkout window closes.",
      409,
      "SUPERVISED_LATE_WINDOW_REQUIRED",
    );
  }

  return {
    clock,
    branchId,
    session,
  };
}

async function requireFirstCardPendingHandover(
  input: {
    access: SchoolAccess;
    studentId: string;
  },
): Promise<string> {
  const db = getDb();
  const result = await db.execute(sql`
    select
      count(*)::int as card_count,
      max(card.id::text) filter (
        where card.status = 'READY_FOR_ACTIVATION'::student_identity_card_status
      ) as pending_card_id,
      count(*) filter (
        where card.status = 'READY_FOR_ACTIVATION'::student_identity_card_status
      )::int as pending_count
    from student_identity_cards card
    where
      card.school_id = ${input.access.school.id}::uuid
      and card.student_id = ${input.studentId}::uuid
  `);

  const row = rowsOf<{
    card_count: number;
    pending_card_id: string | null;
    pending_count: number;
  }>(result)[0];

  if (
    Number(row?.card_count ?? 0) !== 1 ||
    Number(row?.pending_count ?? 0) !== 1 ||
    !row?.pending_card_id
  ) {
    throw new SupervisedArrivalError(
      "The student is not waiting for handover of their first physical card.",
      409,
      "FIRST_CARD_PENDING_HANDOVER_REQUIRED",
    );
  }

  const replacement = await db.execute(sql`
    select id
    from student_card_replacement_cases
    where
      school_id = ${input.access.school.id}::uuid
      and student_id = ${input.studentId}::uuid
      and status = 'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
    limit 1
  `);

  if (rowsOf(replacement).length > 0) {
    throw new SupervisedArrivalError(
      "Card-replacement attendance uses the separate audited replacement exception flow.",
      409,
      "CARD_REPLACEMENT_EXCEPTION_REQUIRED",
    );
  }

  return row.pending_card_id;
}

export async function recordFirstCardAttendanceException(
  input: {
    access: SchoolAccess;
    studentId: string;
    verificationMethod: SupervisedFaceVerificationMethod;
  },
) {
  const { branchId, session } = await requireOpenSessionWindow({
    access: input.access,
    studentId: input.studentId,
    mode: "FIRST_CARD",
  });

  // Branch is resolved again inside the transaction-facing service so a caller
  // cannot use organization access to record attendance for a different branch.
  void branchId;

  await requireActiveBiometricProfile({
    access: input.access,
    studentId: input.studentId,
  });

  const pendingCardId = await requireFirstCardPendingHandover({
    access: input.access,
    studentId: input.studentId,
  });

  const db = getDb();
  const result = await db.execute(sql`
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
      select
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
      where exists (
        select 1
        from student_identity_cards card
        where
          card.school_id = ${input.access.school.id}::uuid
          and card.student_id = ${input.studentId}::uuid
          and card.id = ${pendingCardId}::uuid
          and card.status = 'READY_FOR_ACTIVATION'::student_identity_card_status
      )
      and not exists (
        select 1
        from student_card_replacement_cases replacement
        where
          replacement.school_id = ${input.access.school.id}::uuid
          and replacement.student_id = ${input.studentId}::uuid
          and replacement.status = 'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
      )
      on conflict (school_id, session_id, student_id)
      do nothing
      returning id, school_id, session_id, student_id, recorded_at
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
        'FIRST_CARD_PENDING_HANDOVER',
        record.recorded_at,
        now()
      from inserted_record record
      returning id, school_id, student_id, attendance_record_id, occurred_at
    ),
    inserted_exception as (
      insert into student_first_card_attendance_exceptions (
        id,
        school_id,
        student_id,
        pending_card_id,
        session_id,
        attendance_record_id,
        verified_by_membership_id,
        verification_method,
        created_at
      )
      select
        gen_random_uuid(),
        record.school_id,
        record.student_id,
        ${pendingCardId}::uuid,
        record.session_id,
        record.id,
        ${input.access.membership.id}::uuid,
        ${input.verificationMethod}::student_card_attendance_exception_verification,
        now()
      from inserted_record record
      returning id, attendance_record_id
    ),
    active_sender as (
      select sender.id, sender.school_id
      from school_whatsapp_senders sender
      where
        sender.school_id = ${input.access.school.id}::uuid
        and sender.status = 'ACTIVE'::school_messaging_sender_status
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
        guardian.phone as recipient_phone,
        student.casa_student_id,
        concat_ws(
          ' ',
          student.first_name,
          nullif(student.middle_name, ''),
          student.last_name
        ) as student_name
      from inserted_event event
      join active_sender sender on sender.school_id = event.school_id
      join student_guardians mapping
        on mapping.school_id = event.school_id
       and mapping.student_id = event.student_id
       and mapping.receives_notifications = true
      join guardians guardian
        on guardian.school_id = mapping.school_id
       and guardian.id = mapping.guardian_id
       and guardian.status = 'ACTIVE'::guardian_status
       and guardian.phone is not null
       and length(trim(guardian.phone)) > 0
      join students student
        on student.school_id = event.school_id
       and student.id = event.student_id
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
        'student_first_card_exception_checked_in',
        jsonb_build_object(
          'studentName', recipients.student_name,
          'casaStudentId', recipients.casa_student_id,
          'checkedInAt', recipients.occurred_at,
          'attendanceMethod', 'FIRST_CARD_PENDING_HANDOVER',
          'message', recipients.student_name ||
            ' has arrived at school through the supervised first-card handover exception.'
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
      record.id as attendance_record_id,
      event.id as presence_event_id,
      exception.id as exception_id,
      (select count(*)::int from queued) as guardian_notifications_queued
    from inserted_record record
    join inserted_event event
      on event.attendance_record_id = record.id
    join inserted_exception exception
      on exception.attendance_record_id = record.id
  `);

  const row = rowsOf<{
    attendance_record_id: string;
    presence_event_id: string;
    exception_id: string;
    guardian_notifications_queued: number;
  }>(result)[0];

  if (!row) {
    throw new SupervisedArrivalError(
      "Attendance or first-card state changed before the supervised exception could be recorded.",
      409,
      "FIRST_CARD_EXCEPTION_STATE_CHANGED",
    );
  }

  return {
    attendanceRecordId: row.attendance_record_id,
    presenceEventId: row.presence_event_id,
    exceptionId: row.exception_id,
    attendanceRecordStatus: "MANUAL" as const,
    verificationMethod: input.verificationMethod,
    guardianNotificationsQueued: Number(
      row.guardian_notifications_queued,
    ),
  };
}

export async function recordSupervisedLateArrival(
  input: {
    access: SchoolAccess;
    studentId: string;
    reason: string;
  },
) {
  const { branchId, session } = await requireOpenSessionWindow({
    access: input.access,
    studentId: input.studentId,
    mode: "LATE",
  });

  const reason = input.reason.trim();

  if (reason.length < 3 || reason.length > 240) {
    throw new SupervisedArrivalError(
      "A supervised late-arrival reason between 3 and 240 characters is required.",
      400,
      "SUPERVISED_LATE_REASON_REQUIRED",
    );
  }

  const db = getDb();
  const result = await db.execute(sql`
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
        'LATE'::attendance_record_status,
        ${input.access.membership.id}::uuid,
        'ON_CAMPUS'::attendance_presence_state,
        'NOT_RUN'::attendance_departure_result,
        now(),
        now()
      )
      on conflict (school_id, session_id, student_id)
      do nothing
      returning id, school_id, session_id, student_id, recorded_at
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
        'SUPERVISED_AFTER_WINDOW_LATE: ' || ${reason},
        record.recorded_at,
        now()
      from inserted_record record
      returning id, school_id, student_id, attendance_record_id, occurred_at
    ),
    inserted_audit as (
      insert into student_supervised_late_arrivals (
        id,
        school_id,
        branch_id,
        student_id,
        session_id,
        attendance_record_id,
        verified_by_membership_id,
        reason,
        occurred_at,
        created_at
      )
      select
        gen_random_uuid(),
        record.school_id,
        ${branchId}::uuid,
        record.student_id,
        record.session_id,
        record.id,
        ${input.access.membership.id}::uuid,
        ${reason},
        record.recorded_at,
        now()
      from inserted_record record
      returning id, attendance_record_id
    ),
    active_sender as (
      select sender.id, sender.school_id
      from school_whatsapp_senders sender
      where
        sender.school_id = ${input.access.school.id}::uuid
        and sender.status = 'ACTIVE'::school_messaging_sender_status
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
        guardian.phone as recipient_phone,
        student.casa_student_id,
        concat_ws(
          ' ',
          student.first_name,
          nullif(student.middle_name, ''),
          student.last_name
        ) as student_name
      from inserted_event event
      join active_sender sender on sender.school_id = event.school_id
      join student_guardians mapping
        on mapping.school_id = event.school_id
       and mapping.student_id = event.student_id
       and mapping.receives_notifications = true
      join guardians guardian
        on guardian.school_id = mapping.school_id
       and guardian.id = mapping.guardian_id
       and guardian.status = 'ACTIVE'::guardian_status
       and guardian.phone is not null
       and length(trim(guardian.phone)) > 0
      join students student
        on student.school_id = event.school_id
       and student.id = event.student_id
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
        'student_supervised_late_checked_in',
        jsonb_build_object(
          'studentName', recipients.student_name,
          'casaStudentId', recipients.casa_student_id,
          'checkedInAt', recipients.occurred_at,
          'attendanceMethod', 'SUPERVISED_AFTER_WINDOW_LATE',
          'late', true,
          'message', recipients.student_name ||
            ' has arrived at school after the normal check-in window.'
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
      record.id as attendance_record_id,
      event.id as presence_event_id,
      audit.id as audit_id,
      (select count(*)::int from queued) as guardian_notifications_queued
    from inserted_record record
    join inserted_event event
      on event.attendance_record_id = record.id
    join inserted_audit audit
      on audit.attendance_record_id = record.id
  `);

  const row = rowsOf<{
    attendance_record_id: string;
    presence_event_id: string;
    audit_id: string;
    guardian_notifications_queued: number;
  }>(result)[0];

  if (!row) {
    throw new SupervisedArrivalError(
      "Attendance changed before the supervised late arrival could be recorded.",
      409,
      "SUPERVISED_LATE_STATE_CHANGED",
    );
  }

  return {
    attendanceRecordId: row.attendance_record_id,
    presenceEventId: row.presence_event_id,
    auditId: row.audit_id,
    attendanceRecordStatus: "LATE" as const,
    guardianNotificationsQueued: Number(
      row.guardian_notifications_queued,
    ),
  };
}
