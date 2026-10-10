import {
  randomUUID,
} from "node:crypto";

import {
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  getTerminalBranchAttendanceContext,
} from "@/server/attendance/branch-session";
import {
  getAttendanceScopeRejection,
  resolveAttendanceOperationalScope,
} from "@/server/attendance/operational-scope";
import {
  classifyCheckIn,
  classifyCheckOut,
} from "@/server/attendance/presence";
import type {
  TerminalAccess,
} from "@/server/attendance/terminal-auth";
import {
  resolveTransportPunctuality,
} from "@/server/attendance/transport-punctuality";
import {
  queueGuardianPresencePushBestEffort,
} from "@/server/messaging/guardian-presence-push";

function rowsOf<T>(
  value: unknown,
): T[] {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value as T[];
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "rows" in value &&
    Array.isArray(
      (
        value as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      value as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

export interface ContinuitySyncInput {
  requestId: string;
  sessionId: string;
  studentId: string;
  tokenHash: string;
  operation:
    | "CHECK_IN"
    | "CHECK_OUT";
  timeResult:
    | "NOT_RUN"
    | "ON_TIME"
    | "LATE";
  departureResult:
    | "NOT_RUN"
    | "NORMAL";
  capturedAt: string;
  connectivityMode:
    | "DEGRADED"
    | "OFFLINE";
  cacheIssuedAt: string;
  cacheExpiresAt: string;
}

export type ContinuitySyncResult =
  | {
      requestId: string;
      status:
        "RECORDED";
      replayed: boolean;
      attendanceRecordId:
        string;
      presenceEventId:
        string;
      operation:
        | "CHECK_IN"
        | "CHECK_OUT";
      capturedAt: string;
      notificationQueued:
        number;
      guardianPushQueued:
        number;
    }
  | {
      requestId: string;
      status:
        "ALREADY_RECORDED";
      replayed: true;
      operation:
        | "CHECK_IN"
        | "CHECK_OUT";
      capturedAt: string;
    }
  | {
      requestId: string;
      status:
        "REJECTED";
      replayed: boolean;
      code: string;
      message: string;
      capturedAt: string;
    };

function rejected(
  input:
    ContinuitySyncInput,
  code: string,
  message: string,
  replayed =
    false,
): ContinuitySyncResult {
  return {
    requestId:
      input.requestId,
    status:
      "REJECTED",
    replayed,
    code,
    message,
    capturedAt:
      input.capturedAt,
  };
}

async function existingResult(
  access:
    TerminalAccess,
  input:
    ContinuitySyncInput,
): Promise<
  ContinuitySyncResult |
  null
> {
  const rows =
    rowsOf<{
      outcome: string;
      reason_code:
        string | null;
      attendance_record_id:
        string | null;
      presence_event_id:
        string | null;
    }>(
      await getDb()
        .execute(sql`
          select
            attempt.outcome::text
              as outcome,
            attempt.reason_code,
            record.id::text
              as attendance_record_id,
            event.id::text
              as presence_event_id
          from attendance_verification_attempts
            attempt
          left join student_attendance_records
            record
            on record.school_id =
               attempt.school_id
           and (
             record.source_attempt_id =
               attempt.id
             or record.check_out_attempt_id =
               attempt.id
           )
          left join student_presence_events
            event
            on event.school_id =
               attempt.school_id
           and event.attempt_id =
               attempt.id
          where
            attempt.school_id =
              ${access.school.id}::uuid
            and attempt.terminal_id =
              ${access.terminal.id}::uuid
            and attempt.terminal_request_id =
              ${input.requestId}
          limit 1
        `),
    );

  const row =
    rows[0];

  if (!row) {
    return null;
  }

  if (
    row.outcome ===
      "RECORDED" &&
    row.attendance_record_id &&
    row.presence_event_id
  ) {
    return {
      requestId:
        input.requestId,
      status:
        "RECORDED",
      replayed: true,
      attendanceRecordId:
        row.attendance_record_id,
      presenceEventId:
        row.presence_event_id,
      operation:
        input.operation,
      capturedAt:
        input.capturedAt,
      notificationQueued:
        0,
      guardianPushQueued:
        0,
    };
  }

  if (
    row.outcome ===
      "REJECTED"
  ) {
    return rejected(
      input,
      row.reason_code ??
        "CONTINUITY_REJECTED",
      "This continuity event was already rejected by CASA.",
      true,
    );
  }

  return rejected(
    input,
    "CONTINUITY_ATTEMPT_CONFLICT",
    "CASA found an incomplete prior continuity attempt for this scan.",
    true,
  );
}

async function queueSchoolNotification(
  input: {
    schoolId: string;
    studentId: string;
    attendanceRecordId:
      string;
    presenceEventId:
      string;
    operation:
      | "CHECK_IN"
      | "CHECK_OUT";
    capturedAt: string;
    connectivityMode:
      | "DEGRADED"
      | "OFFLINE";
  },
): Promise<number> {
  const eventType =
    input.operation ===
      "CHECK_IN"
      ? "STUDENT_CHECKED_IN"
      : "STUDENT_SIGNED_OUT";

  const templateKey =
    input.operation ===
      "CHECK_IN"
      ? "student_checked_in"
      : "student_signed_out";

  const timestampKey =
    input.operation ===
      "CHECK_IN"
      ? "checkedInAt"
      : "signedOutAt";

  const result =
    await getDb()
      .execute(sql`
        with active_sender as (
          select
            sender.id,
            sender.school_id
          from school_whatsapp_senders
            sender
          where
            sender.school_id =
              ${input.schoolId}::uuid
            and sender.status =
              'ACTIVE'::school_messaging_sender_status
          limit 1
        ),
        recipients as (
          select
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
          from active_sender
            sender
          join students
            student
            on student.school_id =
               sender.school_id
           and student.id =
               ${input.studentId}::uuid
          join student_guardians
            relationship
            on relationship.school_id =
               student.school_id
           and relationship.student_id =
               student.id
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
            ${input.schoolId}::uuid,
            ${input.attendanceRecordId}::uuid,
            ${input.presenceEventId}::uuid,
            recipients.guardian_id,
            recipients.sender_id,
            ${eventType}::school_notification_event_type,
            recipients.recipient_phone,
            ${templateKey},
            jsonb_build_object(
              'studentName',
                recipients.student_name,
              'casaStudentId',
                recipients.casa_student_id,
              ${timestampKey},
                ${input.capturedAt}::timestamptz,
              'connectivityDelayed',
                true,
              'connectivityMode',
                ${input.connectivityMode}
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
          count(*)::int
            as count
        from inserted
      `);

  return Number(
    rowsOf<{
      count: unknown;
    }>(
      result,
    )[0]?.count ??
      0,
  );
}

async function recordedPushCount(
  input: {
    schoolId: string;
    studentId: string;
    attendanceRecordId:
      string;
    presenceEventId:
      string;
    operation:
      | "CHECK_IN"
      | "CHECK_OUT";
  },
) {
  return queueGuardianPresencePushBestEffort({
    schoolId:
      input.schoolId,
    studentId:
      input.studentId,
    attendanceRecordId:
      input.attendanceRecordId,
    presenceEventId:
      input.presenceEventId,
    eventType:
      input.operation ===
        "CHECK_IN"
        ? "STUDENT_CHECKED_IN"
        : "STUDENT_SIGNED_OUT",
  });
}

export async function syncContinuityEvent(
  access:
    TerminalAccess,
  input:
    ContinuitySyncInput,
): Promise<
  ContinuitySyncResult
> {
  const replay =
    await existingResult(
      access,
      input,
    );

  if (replay) {
    return replay;
  }

  const capturedAt =
    new Date(
      input.capturedAt,
    );
  const issuedAt =
    new Date(
      input.cacheIssuedAt,
    );
  const expiresAt =
    new Date(
      input.cacheExpiresAt,
    );
  const now =
    new Date();

  if (
    Number.isNaN(
      capturedAt.getTime(),
    ) ||
    Number.isNaN(
      issuedAt.getTime(),
    ) ||
    Number.isNaN(
      expiresAt.getTime(),
    )
  ) {
    return rejected(
      input,
      "CONTINUITY_TIME_INVALID",
      "The continuity event contains an invalid timestamp.",
    );
  }

  if (
    expiresAt <=
      issuedAt ||
    expiresAt.getTime() -
      issuedAt.getTime() >
      13 *
        60 *
        60 *
        1000
  ) {
    return rejected(
      input,
      "CONTINUITY_CACHE_WINDOW_INVALID",
      "The continuity authorization window is invalid.",
    );
  }

  if (
    capturedAt <
      new Date(
        issuedAt.getTime() -
          120_000,
      ) ||
    capturedAt >
      expiresAt
  ) {
    return rejected(
      input,
      "CONTINUITY_CACHE_EXPIRED",
      "The card was scanned outside the authorized continuity cache window.",
    );
  }

  if (
    capturedAt.getTime() >
      now.getTime() +
        120_000 ||
    now.getTime() -
      capturedAt.getTime() >
      48 *
        60 *
        60 *
        1000
  ) {
    return rejected(
      input,
      "CONTINUITY_CAPTURE_TIME_OUT_OF_RANGE",
      "The continuity scan time is outside CASA's accepted reconciliation window.",
    );
  }

  const active =
    await getTerminalBranchAttendanceContext({
      schoolId:
        access.school.id,
      terminalId:
        access.terminal.id,
      timezone:
        access.school.timezone,
      now:
        capturedAt,
    });

  if (
    !active.branch ||
    active.branch.status !==
      "ACTIVE" ||
    !active.session ||
    !active.session
      .branchSessionId ||
    active.session.id !==
      input.sessionId
  ) {
    return rejected(
      input,
      "CONTINUITY_SESSION_MISMATCH",
      "The cached attendance session no longer matches this terminal and campus.",
    );
  }

  if (
    active.session.status ===
      "CANCELLED" ||
    active.session.status ===
      "PLANNED"
  ) {
    return rejected(
      input,
      "CONTINUITY_SESSION_NOT_OPEN_AT_CAPTURE",
      "The attendance session was not valid for continuity recording.",
    );
  }

  const openedAt =
    active.session.openedAt
      ? new Date(
          active.session
            .openedAt instanceof
              Date
            ? active.session
                .openedAt
                .getTime()
            : active.session
                .openedAt,
        )
      : null;
  const closedAt =
    active.session.closedAt
      ? new Date(
          active.session
            .closedAt instanceof
              Date
            ? active.session
                .closedAt
                .getTime()
            : active.session
                .closedAt,
        )
      : null;

  if (
    !openedAt ||
    Number.isNaN(
      openedAt.getTime(),
    ) ||
    capturedAt.getTime() <
      openedAt.getTime() -
        120_000 ||
    (
      closedAt &&
      !Number.isNaN(
        closedAt.getTime(),
      ) &&
      capturedAt >
        new Date(
          closedAt.getTime() +
            120_000,
        )
    )
  ) {
    return rejected(
      input,
      "CONTINUITY_SESSION_TIME_MISMATCH",
      "The continuity scan falls outside the campus attendance session.",
    );
  }

  const db =
    getDb();

  const card =
    rowsOf<{
      card_id: string;
      card_status:
        string;
      student_id:
        string;
      student_status:
        string;
    }>(
      await db.execute(sql`
        select
          card.id::text
            as card_id,
          card.status::text
            as card_status,
          student.id::text
            as student_id,
          student.status::text
            as student_status
        from student_identity_cards
          card
        join students
          student
          on student.school_id =
             card.school_id
         and student.id =
             card.student_id
        where
          card.school_id =
            ${access.school.id}::uuid
          and card.token_hash =
            ${input.tokenHash}
        limit 1
      `),
    )[0];

  if (!card) {
    return rejected(
      input,
      "UNKNOWN_CARD",
      "This card is no longer recognized by the school.",
    );
  }

  if (
    card.card_status !==
      "ACTIVE"
  ) {
    return rejected(
      input,
      "CARD_NOT_ACTIVE",
      "This card is no longer active.",
    );
  }

  if (
    card.student_status !==
      "ACTIVE"
  ) {
    return rejected(
      input,
      "STUDENT_NOT_ACTIVE",
      "This student is no longer active.",
    );
  }

  if (
    card.student_id !==
      input.studentId
  ) {
    return rejected(
      input,
      "CONTINUITY_CARD_SUBJECT_MISMATCH",
      "The cached student identity does not match the current card owner.",
    );
  }

  const operationalScope =
    await resolveAttendanceOperationalScope({
      schoolId:
        access.school.id,
      sessionId:
        input.sessionId,
      terminalId:
        access.terminal.id,
      studentId:
        card.student_id,
    });

  const scopeRejection =
    getAttendanceScopeRejection(
      operationalScope,
      input.operation,
    );

  if (scopeRejection) {
    return rejected(
      input,
      scopeRejection.code,
      scopeRejection.message,
    );
  }

  const record =
    rowsOf<{
      id: string;
      presence_state:
        | "ON_CAMPUS"
        | "SIGNED_OUT";
      recorded_at:
        string | Date;
    }>(
      await db.execute(sql`
        select
          id::text,
          presence_state::text
            as presence_state,
          recorded_at
        from student_attendance_records
        where
          school_id =
            ${access.school.id}::uuid
          and session_id =
            ${input.sessionId}::uuid
          and student_id =
            ${card.student_id}::uuid
        limit 1
      `),
    )[0];

  if (
    input.operation ===
      "CHECK_IN" &&
    record?.presence_state ===
      "ON_CAMPUS"
  ) {
    return {
      requestId:
        input.requestId,
      status:
        "ALREADY_RECORDED",
      replayed: true,
      operation:
        input.operation,
      capturedAt:
        input.capturedAt,
    };
  }

  if (
    input.operation ===
      "CHECK_IN" &&
    record?.presence_state ===
      "SIGNED_OUT"
  ) {
    return rejected(
      input,
      "REENTRY_NOT_ENABLED",
      "This student has already signed out for this attendance session.",
    );
  }

  if (
    input.operation ===
      "CHECK_OUT" &&
    record?.presence_state ===
      "SIGNED_OUT"
  ) {
    return {
      requestId:
        input.requestId,
      status:
        "ALREADY_RECORDED",
      replayed: true,
      operation:
        input.operation,
      capturedAt:
        input.capturedAt,
    };
  }

  if (
    input.operation ===
      "CHECK_OUT" &&
    !record
  ) {
    return rejected(
      input,
      "NOT_CHECKED_IN",
      "CASA cannot reconcile a check-out before a valid check-in.",
    );
  }

  if (
    input.operation ===
      "CHECK_OUT" &&
    record
  ) {
    const recordedAt =
      record.recorded_at instanceof
        Date
        ? record.recorded_at
        : new Date(
            record.recorded_at,
          );

    if (
      Number.isNaN(
        recordedAt.getTime(),
      ) ||
      capturedAt <
        recordedAt
    ) {
      return rejected(
        input,
        "CONTINUITY_EVENT_ORDER_INVALID",
        "The continuity check-out time is earlier than the accepted check-in time.",
      );
    }
  }

  let timeResult:
    | "NOT_RUN"
    | "ON_TIME"
    | "LATE" =
      "NOT_RUN";

  let departureResult:
    | "NOT_RUN"
    | "NORMAL" =
      "NOT_RUN";

  let status:
    | "ON_TIME"
    | "LATE" =
      "ON_TIME";

  let punctuality:
    | Awaited<
        ReturnType<
          typeof resolveTransportPunctuality
        >
      >
    | null =
      null;

  if (
    input.operation ===
      "CHECK_IN"
  ) {
    if (
      active.session.mode ===
        "PRESENCE_ONLY"
    ) {
      timeResult =
        "ON_TIME";
    } else {
      if (
        !active.policyDay
      ) {
        return rejected(
          input,
          "ATTENDANCE_POLICY_DAY_MISSING",
          "Today's attendance timetable is unavailable.",
        );
      }

      const classification =
        classifyCheckIn(
          active.clock.clock,
          active.policyDay
            .checkInOpensAt,
          active.policyDay
            .onTimeUntil,
          active.policyDay
            .checkInClosesAt,
        );

      if (
        classification ===
          "BEFORE_WINDOW"
      ) {
        return rejected(
          input,
          "CHECK_IN_NOT_OPEN",
          "The continuity scan occurred before check-in opened.",
        );
      }

      if (
        classification ===
          "OUTSIDE_WINDOW"
      ) {
        return rejected(
          input,
          "CHECK_IN_WINDOW_CLOSED",
          "The continuity scan occurred after the normal check-in window closed.",
        );
      }

      timeResult =
        classification;

      try {
        punctuality =
          await resolveTransportPunctuality({
            schoolId:
              access.school.id,
            studentId:
              card.student_id,
            sessionId:
              input.sessionId,
            occurredAt:
              capturedAt,
          });
      } catch {
        return rejected(
          input,
          "ATTENDANCE_PUNCTUALITY_POLICY_REQUIRED",
          "CASA could not resolve the student's punctuality policy for this continuity scan.",
        );
      }

      status =
        punctuality.outcome ===
          "LATE"
          ? "LATE"
          : "ON_TIME";
    }
  } else {
    if (
      active.session.mode ===
        "PRESENCE_ONLY"
    ) {
      departureResult =
        "NORMAL";
    } else {
      if (
        !active.policyDay
      ) {
        return rejected(
          input,
          "ATTENDANCE_POLICY_DAY_MISSING",
          "Today's attendance timetable is unavailable.",
        );
      }

      const classification =
        classifyCheckOut(
          active.clock.clock,
          active.policyDay
            .normalDismissalAt,
          active.policyDay
            .checkOutClosesAt,
        );

      if (
        classification ===
          "EARLY"
      ) {
        return rejected(
          input,
          "EARLY_DEPARTURE_AUTH_REQUIRED",
          "Early departure cannot be reconciled from continuity mode.",
        );
      }

      if (
        classification ===
          "OUTSIDE_WINDOW"
      ) {
        return rejected(
          input,
          "CHECK_OUT_WINDOW_CLOSED",
          "The continuity scan occurred after normal check-out closed.",
        );
      }

      departureResult =
        "NORMAL";
    }
  }

  const syncAt =
    new Date()
      .toISOString();

  await db.execute(sql`
    update attendance_verification_attempts
    set
      face_result =
        'UNAVAILABLE'::attendance_face_result,
      liveness_result =
        'UNAVAILABLE'::attendance_liveness_result,
      outcome =
        'REJECTED'::attendance_attempt_outcome,
      reason_code =
        'CONNECTIVITY_CONTINUITY_SUPERSEDED',
      completed_at =
        ${syncAt}::timestamptz
    where
      school_id =
        ${access.school.id}::uuid
      and terminal_id =
        ${access.terminal.id}::uuid
      and session_id =
        ${input.sessionId}::uuid
      and student_id =
        ${card.student_id}::uuid
      and outcome =
        'PENDING'::attendance_attempt_outcome
  `);

  const attemptId =
    randomUUID();

  const continuityReason =
    input.connectivityMode ===
      "OFFLINE"
      ? "CONNECTIVITY_CONTINUITY_OFFLINE"
      : "CONNECTIVITY_CONTINUITY_DEGRADED";

  let row:
    | {
        recorded:
          boolean;
        attendance_record_id:
          string | null;
        presence_event_id:
          string | null;
      }
    | undefined;

  if (
    input.operation ===
      "CHECK_IN"
  ) {
    row =
      rowsOf<{
        recorded:
          boolean;
        attendance_record_id:
          string | null;
        presence_event_id:
          string | null;
      }>(
        await db.execute(sql`
          with inserted_attempt as (
            insert into attendance_verification_attempts (
              id,
              school_id,
              session_id,
              terminal_id,
              terminal_request_id,
              student_id,
              card_id,
              scanned_token_hash,
              operation,
              card_result,
              face_result,
              liveness_result,
              time_result,
              departure_result,
              outcome,
              reason_code,
              occurred_at,
              completed_at,
              created_at
            ) values (
              ${attemptId}::uuid,
              ${access.school.id}::uuid,
              ${input.sessionId}::uuid,
              ${access.terminal.id}::uuid,
              ${input.requestId},
              ${card.student_id}::uuid,
              ${card.card_id}::uuid,
              ${input.tokenHash},
              'CHECK_IN'::attendance_operation,
              'MATCHED'::attendance_card_result,
              'UNAVAILABLE'::attendance_face_result,
              'UNAVAILABLE'::attendance_liveness_result,
              ${timeResult}::attendance_time_result,
              'NOT_RUN'::attendance_departure_result,
              'PENDING'::attendance_attempt_outcome,
              ${continuityReason},
              ${input.capturedAt}::timestamptz,
              null,
              ${syncAt}::timestamptz
            )
            on conflict do nothing
            returning id
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
              ${access.school.id}::uuid,
              ${input.sessionId}::uuid,
              ${card.student_id}::uuid,
              ${access.terminal.id}::uuid,
              ${card.card_id}::uuid,
              inserted_attempt.id,
              ${status}::attendance_record_status,
              ${punctuality?.officialStartTime ?? null}::time,
              ${punctuality?.actualArrivalAt ?? null}::timestamptz,
              ${punctuality?.arrivalMethod ?? null},
              ${punctuality?.arrivalMethodAssignmentId ?? null}::uuid,
              ${punctuality?.graceMinutesUsed ?? null},
              ${punctuality?.minutesAfterOfficialStart ?? null},
              ${punctuality?.outcome ?? null},
              ${punctuality?.policyId ?? null}::uuid,
              ${active.session.mode !== "PRESENCE_ONLY"},
              'ON_CAMPUS'::attendance_presence_state,
              'NOT_RUN'::attendance_departure_result,
              ${input.capturedAt}::timestamptz,
              ${syncAt}::timestamptz
            from inserted_attempt
            on conflict (
              school_id,
              session_id,
              student_id
            ) do nothing
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
              reason,
              occurred_at,
              created_at
            )
            select
              ${access.school.id}::uuid,
              ${input.sessionId}::uuid,
              ${card.student_id}::uuid,
              inserted_record.id,
              ${attemptId}::uuid,
              ${access.terminal.id}::uuid,
              ${card.card_id}::uuid,
              'CHECKED_IN'::attendance_presence_event_type,
              'NOT_RUN'::attendance_departure_result,
              ${continuityReason},
              ${input.capturedAt}::timestamptz,
              ${syncAt}::timestamptz
            from inserted_record
            on conflict do nothing
            returning
              id,
              attendance_record_id
          ),
          recorded_attempt as (
            update attendance_verification_attempts
            set
              outcome =
                'RECORDED'::attendance_attempt_outcome,
              completed_at =
                ${syncAt}::timestamptz
            where
              id =
                ${attemptId}::uuid
              and exists (
                select 1
                from inserted_event
              )
            returning id
          ),
          rejected_attempt as (
            update attendance_verification_attempts
            set
              outcome =
                'REJECTED'::attendance_attempt_outcome,
              reason_code =
                'FINALIZATION_STATE_CONFLICT',
              completed_at =
                ${syncAt}::timestamptz
            where
              id =
                ${attemptId}::uuid
              and outcome =
                'PENDING'::attendance_attempt_outcome
              and not exists (
                select 1
                from inserted_event
              )
            returning id
          )
          select
            true
              as recorded,
            inserted_event
              .attendance_record_id::text
              as attendance_record_id,
            inserted_event.id::text
              as presence_event_id
          from inserted_event
          union all
          select
            false
              as recorded,
            null::text
              as attendance_record_id,
            null::text
              as presence_event_id
          from rejected_attempt
          limit 1
        `),
      )[0];
  } else {
    row =
      rowsOf<{
        recorded:
          boolean;
        attendance_record_id:
          string | null;
        presence_event_id:
          string | null;
      }>(
        await db.execute(sql`
          with inserted_attempt as (
            insert into attendance_verification_attempts (
              id,
              school_id,
              session_id,
              terminal_id,
              terminal_request_id,
              student_id,
              card_id,
              scanned_token_hash,
              operation,
              card_result,
              face_result,
              liveness_result,
              time_result,
              departure_result,
              outcome,
              reason_code,
              occurred_at,
              completed_at,
              created_at
            ) values (
              ${attemptId}::uuid,
              ${access.school.id}::uuid,
              ${input.sessionId}::uuid,
              ${access.terminal.id}::uuid,
              ${input.requestId},
              ${card.student_id}::uuid,
              ${card.card_id}::uuid,
              ${input.tokenHash},
              'CHECK_OUT'::attendance_operation,
              'MATCHED'::attendance_card_result,
              'UNAVAILABLE'::attendance_face_result,
              'UNAVAILABLE'::attendance_liveness_result,
              'NOT_RUN'::attendance_time_result,
              ${departureResult}::attendance_departure_result,
              'PENDING'::attendance_attempt_outcome,
              ${continuityReason},
              ${input.capturedAt}::timestamptz,
              null,
              ${syncAt}::timestamptz
            )
            on conflict do nothing
            returning id
          ),
          updated_record as (
            update student_attendance_records
            set
              presence_state =
                'SIGNED_OUT'::attendance_presence_state,
              departure_result =
                'NORMAL'::attendance_departure_result,
              checked_out_at =
                ${input.capturedAt}::timestamptz,
              check_out_attempt_id =
                ${attemptId}::uuid,
              check_out_terminal_id =
                ${access.terminal.id}::uuid,
              check_out_card_id =
                ${card.card_id}::uuid
            where
              school_id =
                ${access.school.id}::uuid
              and session_id =
                ${input.sessionId}::uuid
              and student_id =
                ${card.student_id}::uuid
              and presence_state =
                'ON_CAMPUS'::attendance_presence_state
              and checked_out_at
                is null
              and exists (
                select 1
                from inserted_attempt
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
              reason,
              occurred_at,
              created_at
            )
            select
              ${access.school.id}::uuid,
              ${input.sessionId}::uuid,
              ${card.student_id}::uuid,
              updated_record.id,
              ${attemptId}::uuid,
              ${access.terminal.id}::uuid,
              ${card.card_id}::uuid,
              'CHECKED_OUT'::attendance_presence_event_type,
              'NORMAL'::attendance_departure_result,
              ${continuityReason},
              ${input.capturedAt}::timestamptz,
              ${syncAt}::timestamptz
            from updated_record
            on conflict do nothing
            returning
              id,
              attendance_record_id
          ),
          recorded_attempt as (
            update attendance_verification_attempts
            set
              outcome =
                'RECORDED'::attendance_attempt_outcome,
              completed_at =
                ${syncAt}::timestamptz
            where
              id =
                ${attemptId}::uuid
              and exists (
                select 1
                from inserted_event
              )
            returning id
          ),
          rejected_attempt as (
            update attendance_verification_attempts
            set
              outcome =
                'REJECTED'::attendance_attempt_outcome,
              reason_code =
                'FINALIZATION_STATE_CONFLICT',
              completed_at =
                ${syncAt}::timestamptz
            where
              id =
                ${attemptId}::uuid
              and outcome =
                'PENDING'::attendance_attempt_outcome
              and not exists (
                select 1
                from inserted_event
              )
            returning id
          )
          select
            true
              as recorded,
            inserted_event
              .attendance_record_id::text
              as attendance_record_id,
            inserted_event.id::text
              as presence_event_id
          from inserted_event
          union all
          select
            false
              as recorded,
            null::text
              as attendance_record_id,
            null::text
              as presence_event_id
          from rejected_attempt
          limit 1
        `),
      )[0];
  }

  if (
    !row
  ) {
    const after =
      await existingResult(
        access,
        input,
      );

    return (
      after ??
      rejected(
        input,
        "CONTINUITY_SYNC_CONFLICT",
        "CASA could not settle this continuity event.",
      )
    );
  }

  if (
    !row.recorded ||
    !row.attendance_record_id ||
    !row.presence_event_id
  ) {
    return rejected(
      input,
      "FINALIZATION_STATE_CONFLICT",
      "Attendance state changed before the continuity event could be reconciled.",
    );
  }

  let notificationQueued =
    0;

  try {
    notificationQueued =
      await queueSchoolNotification({
        schoolId:
          access.school.id,
        studentId:
          card.student_id,
        attendanceRecordId:
          row.attendance_record_id,
        presenceEventId:
          row.presence_event_id,
        operation:
          input.operation,
        capturedAt:
          input.capturedAt,
        connectivityMode:
          input.connectivityMode,
      });
  } catch {
    // Attendance remains authoritative even when notification queueing fails.
  }

  const guardianPushQueued =
    await recordedPushCount({
      schoolId:
        access.school.id,
      studentId:
        card.student_id,
      attendanceRecordId:
        row.attendance_record_id,
      presenceEventId:
        row.presence_event_id,
      operation:
        input.operation,
    });

  return {
    requestId:
      input.requestId,
    status:
      "RECORDED",
    replayed: false,
    attendanceRecordId:
      row.attendance_record_id,
    presenceEventId:
      row.presence_event_id,
    operation:
      input.operation,
    capturedAt:
      input.capturedAt,
    notificationQueued,
    guardianPushQueued,
  };
}
