import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";

import {
  classifyTodayPresence,
} from "./operations";

type TodayAttendanceView =
  | "ALL"
  | "PRESENT"
  | "NOT_ARRIVED"
  | "ABSENT"
  | "ON_CAMPUS"
  | "SIGNED_OUT"
  | "LATE"
  | "EXCUSED"
  | "NON_INSTRUCTIONAL"
  | "BRANCH_UNASSIGNED";

function isTodayAttendanceView(
  value: string,
): value is TodayAttendanceView {
  return [
    "ALL",
    "PRESENT",
    "NOT_ARRIVED",
    "ABSENT",
    "ON_CAMPUS",
    "SIGNED_OUT",
    "LATE",
    "EXCUSED",
    "NON_INSTRUCTIONAL",
    "BRANCH_UNASSIGNED",
  ].includes(
    value,
  );
}
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
      (
        result as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      result as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

export async function getTodayAttendanceOperations(
  input: {
    access:
      SchoolAccess;
    query:
      string;
    view:
      string;
    page:
      number;
    pageSize:
      number;
    branchId?:
      string | null;
    classArmId?:
      string | null;
    academicSessionId?:
      string | null;
    date?:
      string | null;
  },
) {
  const db = getDb();

  const liveClock =
    getSchoolClock(
      new Date(),
      input.access.school.timezone,
    );

  const requestedDate =
    input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)
      ? input.date
      : liveClock.date;

  const clock =
    requestedDate === liveClock.date
      ? liveClock
      : {
          date: requestedDate,
          weekday: new Date(`${requestedDate}T12:00:00.000Z`).getUTCDay(),
          clock: requestedDate < liveClock.date ? "23:59" : "00:00",
        };

  const readOnly = requestedDate !== liveClock.date;

  const sessionResult =
    await db.execute(sql`
      select
        session.id,
        coalesce(branch_session.policy_id, session.policy_id) as policy_id,
        session.attendance_date,
        case
          when ${input.branchId ?? null}::uuid is not null then branch_session.status
          else session.status::text
        end as status,
        coalesce(branch_session.mode, 'INSTRUCTIONAL') as mode,
        coalesce(branch_session.opened_at, session.opened_at) as opened_at,
        coalesce(branch_session.closed_at, session.closed_at) as closed_at,
        day.check_in_opens_at,
        day.on_time_until,
        day.check_in_closes_at,
        day.normal_dismissal_at,
        day.check_out_closes_at
      from attendance_sessions
        session
      left join attendance_branch_sessions
        branch_session
        on branch_session.school_id = session.school_id
       and branch_session.session_id = session.id
       and branch_session.branch_id = ${input.branchId ?? null}::uuid
      left join attendance_policy_days
        day
        on day.school_id = session.school_id
       and day.policy_id = coalesce(branch_session.policy_id, session.policy_id)
       and day.weekday = ${clock.weekday}
      where
        session.school_id = ${input.access.school.id}::uuid
        and session.attendance_date = ${clock.date}::date
        and (
          ${input.branchId ?? null}::uuid is null
          or branch_session.id is not null
        )
      limit 1
    `);

  const sessionRow =
    rowsOf<{
      id:
        string;
      policy_id:
        string;
      attendance_date:
        string;
      status:
        | "PLANNED"
        | "OPEN"
        | "CLOSED"
        | "CANCELLED";
      mode:
        "INSTRUCTIONAL" | "PRESENCE_ONLY";
      opened_at:
        Date | string | null;
      closed_at:
        Date | string | null;
      check_in_opens_at:
        string | null;
      on_time_until:
        string | null;
      check_in_closes_at:
        string | null;
      normal_dismissal_at:
        string | null;
      check_out_closes_at:
        string | null;
    }>(
      sessionResult,
    )[0];

  const session =
    sessionRow
      ? {
          id:
            sessionRow.id,
          policyId:
            sessionRow.policy_id,
          attendanceDate:
            sessionRow.attendance_date,
          status:
            sessionRow.status,
          mode:
            sessionRow.mode,
          openedAt:
            sessionRow.opened_at,
          closedAt:
            sessionRow.closed_at,
        }
      : null;

  const policyDay =
    sessionRow &&
    sessionRow.check_in_opens_at &&
    sessionRow.on_time_until &&
    sessionRow.check_in_closes_at &&
    sessionRow.normal_dismissal_at &&
    sessionRow.check_out_closes_at
      ? {
          checkInOpensAt:
            sessionRow.check_in_opens_at,
          onTimeUntil:
            sessionRow.on_time_until,
          checkInClosesAt:
            sessionRow.check_in_closes_at,
          normalDismissalAt:
            sessionRow.normal_dismissal_at,
          checkOutClosesAt:
            sessionRow.check_out_closes_at,
        }
      : null;

  const [
    stateResult,
    terminalResult,
    pending,
    authorizationRows,
    exceptionResult,
  ] =
    await Promise.all([
      db.execute(sql`
        select
          student.id
            as student_id,
          student.casa_student_id,
          student.admission_number,
          enrollment.academic_session_id,
          student.first_name,
          student.middle_name,
          student.last_name,
          arm.id
            as class_arm_id,
          arm.name
            as class_arm_name,
          level.name
            as class_level_name,
          branch_map.branch_id,
          branch.name
            as branch_name,
          record.id
            as attendance_record_id,
          record.status
            as arrival_status,
          record.punctuality_outcome,
          record.arrival_method,
          record.official_start_time::text
            as official_start_time,
          record.actual_arrival_at,
          record.grace_minutes_used,
          record.minutes_after_official_start,
          record.presence_state,
          record.recorded_at,
          record.departure_result,
          record.checked_out_at,
          exists (
            select 1
            from attendance_early_departure_preauthorizations
              preauth
            where
              preauth.school_id =
                enrollment.school_id
              and preauth.session_id =
                ${session?.id ?? null}::uuid
              and preauth.student_id =
                enrollment.student_id
              and preauth.consumed_attempt_id
                is null
              and preauth.revoked_at
                is null
          ) as early_departure_preauthorized,
          calendar.id
            as calendar_event_id,
          calendar.kind
            as calendar_event_kind,
          calendar.title
            as calendar_event_title,
          excuse.id
            as excuse_id,
          excuse.reason
            as excuse_reason,
          card_state.card_count,
          card_state.pending_count,
          replacement.id
            as card_replacement_case_id,
          replacement.reported_lost_on::text
            as card_replacement_reported_lost_on,
          replacement.replacement_requested_at
            as card_replacement_requested_at
        from student_enrollments
          enrollment
        join students student
          on student.school_id =
             enrollment.school_id
         and student.id =
             enrollment.student_id
        join class_arms arm
          on arm.school_id =
             enrollment.school_id
         and arm.id =
             enrollment.class_arm_id
        join class_levels level
          on level.school_id =
             arm.school_id
         and level.id =
             arm.class_level_id
        left join school_branch_class_arms
          branch_map
          on branch_map.school_id =
             enrollment.school_id
         and branch_map.class_arm_id =
             enrollment.class_arm_id
        left join school_branches
          branch
          on branch.school_id =
             branch_map.school_id
         and branch.id =
             branch_map.branch_id
        left join student_attendance_records
          record
          on record.school_id =
             enrollment.school_id
         and record.session_id =
             ${session?.id ?? null}::uuid
         and record.student_id =
             enrollment.student_id
        left join lateral (
          select
            event.id,
            event.kind,
            event.title
          from school_calendar_events
            event
          where
            event.school_id =
              enrollment.school_id
            and event.starts_on <=
              ${clock.date}::date
            and event.ends_on >=
              ${clock.date}::date
            and (
              event.branch_id is null
              or event.branch_id =
                 branch_map.branch_id
            )
          order by
            case
              when event.branch_id is null
                then 0
              else 1
            end,
            event.created_at asc
          limit 1
        ) calendar
          on true
        left join lateral (
          select
            approved.id,
            approved.reason
          from student_attendance_excuses
            approved
          where
            approved.school_id =
              enrollment.school_id
            and approved.student_id =
              enrollment.student_id
            and approved.branch_id =
              branch_map.branch_id
            and approved.status =
              'ACTIVE'::student_attendance_excuse_status
            and approved.starts_on <=
              ${clock.date}::date
            and approved.ends_on >=
              ${clock.date}::date
          order by
            approved.created_at asc
          limit 1
        ) excuse
          on true
        left join lateral (
          select
            count(*)::int
              as card_count,
            count(*) filter (
              where
                card.status =
                  'READY_FOR_ACTIVATION'::student_identity_card_status
            )::int
              as pending_count
          from student_identity_cards
            card
          where
            card.school_id =
              enrollment.school_id
            and card.student_id =
              enrollment.student_id
        ) card_state
          on true
        left join lateral (
          select
            replacement_case.id,
            replacement_case.reported_lost_on,
            replacement_case.replacement_requested_at
          from student_card_replacement_cases
            replacement_case
          where
            replacement_case.school_id =
              enrollment.school_id
            and replacement_case.student_id =
              enrollment.student_id
            and replacement_case.status =
              'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
          order by
            replacement_case.created_at
              desc
          limit 1
        ) replacement
          on true
        where
          enrollment.school_id =
            ${input.access.school.id}::uuid
          and enrollment.status =
            'ACTIVE'::student_enrollment_status
          and student.status =
            'ACTIVE'::student_status
          and enrollment.starts_on <=
            ${clock.date}::date
          and (
            enrollment.ends_on is null
            or enrollment.ends_on >=
               ${clock.date}::date
          )
          and (
            ${input.branchId ?? null}::uuid
              is null
            or branch_map.branch_id =
               ${input.branchId ?? null}::uuid
          )
          and (
            ${input.classArmId ?? null}::uuid
              is null
            or enrollment.class_arm_id =
               ${input.classArmId ?? null}::uuid
          )
          and (
            ${input.academicSessionId ?? null}::uuid
              is null
            or enrollment.academic_session_id =
               ${input.academicSessionId ?? null}::uuid
          )
        order by
          coalesce(
            branch.name,
            ''
          ) asc,
          level.name asc,
          arm.name asc,
          student.last_name asc,
          student.first_name asc
      `),
      db.execute(sql`
        select
          terminal.id,
          terminal.name,
          terminal.status,
          terminal.last_seen_at,
          branch_map.branch_id,
          branch.name
            as branch_name
        from attendance_terminals
          terminal
        left join school_branch_terminals
          branch_map
          on branch_map.school_id =
             terminal.school_id
         and branch_map.terminal_id =
             terminal.id
        left join school_branches
          branch
          on branch.school_id =
             branch_map.school_id
         and branch.id =
             branch_map.branch_id
        where
          terminal.school_id =
            ${input.access.school.id}::uuid
          and (
            ${input.branchId ?? null}::uuid
              is null
            or branch_map.branch_id =
               ${input.branchId ?? null}::uuid
          )
        order by
          terminal.name asc
      `),
      session
        ? db.execute(sql`
            select
              attempt.id
                as attempt_id,
              attempt.student_id,
              student.casa_student_id,
              student.first_name,
              student.middle_name,
              student.last_name,
              attempt.created_at,
              attempt.reason_code,
              attempt.departure_result,
              terminal_branch.branch_id
            from attendance_verification_attempts
              attempt
            join students
              student
              on student.school_id =
                 attempt.school_id
             and student.id =
                 attempt.student_id
            left join school_branch_terminals
              terminal_branch
              on terminal_branch.school_id =
                 attempt.school_id
             and terminal_branch.terminal_id =
                 attempt.terminal_id
            where
              attempt.school_id =
                ${input.access.school.id}::uuid
              and attempt.session_id =
                ${session.id}::uuid
              and attempt.operation =
                'CHECK_OUT'::attendance_operation
              and attempt.outcome =
                'PENDING'::attendance_attempt_outcome
              and (
                attempt.reason_code =
                  'EARLY_DEPARTURE_AUTH_REQUIRED'
                or attempt.departure_result =
                   'EARLY'::attendance_departure_result
              )
              and (
                ${input.branchId ?? null}::uuid
                  is null
                or terminal_branch.branch_id =
                   ${input.branchId ?? null}::uuid
              )
            order by
              attempt.created_at desc
          `)
        : Promise.resolve(
            [],
          ),
      session
        ? db.execute(sql`
            select
              early_auth.attempt_id,
              early_auth.reason
            from attendance_early_departure_authorizations
              early_auth
            join attendance_verification_attempts
              attempt
              on attempt.school_id =
                 early_auth.school_id
             and attempt.id =
                 early_auth.attempt_id
            left join school_branch_terminals
              terminal_branch
              on terminal_branch.school_id =
                 attempt.school_id
             and terminal_branch.terminal_id =
                 attempt.terminal_id
            where
              early_auth.school_id =
                ${input.access.school.id}::uuid
              and early_auth.session_id =
                ${session.id}::uuid
              and (
                ${input.branchId ?? null}::uuid
                  is null
                or terminal_branch.branch_id =
                   ${input.branchId ?? null}::uuid
              )
          `)
        : Promise.resolve(
            [],
          ),
      session
        ? db.execute(sql`
            select
              count(*)::int
                as missing_count
            from student_presence_events
              event
            left join school_branch_terminals
              terminal_branch
              on terminal_branch.school_id =
                 event.school_id
             and terminal_branch.terminal_id =
                 event.terminal_id
            where
              event.school_id =
                ${input.access.school.id}::uuid
              and event.session_id =
                ${session.id}::uuid
              and event.event_type =
                'CHECKED_OUT'::attendance_presence_event_type
              and (
                ${input.branchId ?? null}::uuid
                  is null
                or terminal_branch.branch_id =
                   ${input.branchId ?? null}::uuid
              )
              and not exists (
                select 1
                from school_notification_outbox
                  outbox
                where
                  outbox.school_id =
                    event.school_id
                  and outbox.presence_event_id =
                    event.id
              )
              and not exists (
                select 1
                from guardian_push_outbox
                  push_outbox
                where
                  push_outbox.school_id =
                    event.school_id
                  and push_outbox.presence_event_id =
                    event.id
              )
          `)
        : Promise.resolve(
            [],
          ),
    ]);

  const stateRows =
    rowsOf<{
      student_id:
        string;
      casa_student_id:
        string;
      admission_number:
        string | null;
      academic_session_id:
        string;
      first_name:
        string;
      middle_name:
        string | null;
      last_name:
        string;
      class_arm_id:
        string;
      class_arm_name:
        string;
      class_level_name:
        string;
      branch_id:
        string | null;
      branch_name:
        string | null;
      attendance_record_id:
        string | null;
      arrival_status:
        | "ON_TIME"
        | "LATE"
        | "MANUAL"
        | null;
      punctuality_outcome:
        | "ON_TIME"
        | "ON_TIME_WITH_GRACE"
        | "LATE"
        | null;
      arrival_method:
        | "SCHOOL_BUS"
        | "INDEPENDENT"
        | null;
      official_start_time:
        string | null;
      actual_arrival_at:
        Date | string | null;
      grace_minutes_used:
        number | null;
      minutes_after_official_start:
        number | null;
      presence_state:
        | "ON_CAMPUS"
        | "SIGNED_OUT"
        | null;
      recorded_at:
        Date | string | null;
      departure_result:
        string | null;
      checked_out_at:
        Date | string | null;
      early_departure_preauthorized:
        boolean;
      calendar_event_id:
        string | null;
      calendar_event_kind:
        | "PUBLIC_HOLIDAY"
        | "SCHOOL_BREAK"
        | "BRANCH_CLOSURE"
        | "SPECIAL_NON_INSTRUCTIONAL_DAY"
        | null;
      calendar_event_title:
        string | null;
      excuse_id:
        string | null;
      excuse_reason:
        string | null;
      card_count:
        number;
      pending_count:
        number;
      card_replacement_case_id:
        string | null;
      card_replacement_reported_lost_on:
        string | null;
      card_replacement_requested_at:
        Date | string | null;
    }>(
      stateResult,
    );

  const studentsWithState =
    stateRows.map(
      (student) => {
        const hasRecord =
          Boolean(
            student.attendance_record_id,
          );

        const attendanceExclusion =
          !student.branch_id
            ? "BRANCH_UNASSIGNED" as const
            : student.calendar_event_id
              ? "NON_INSTRUCTIONAL" as const
              : !hasRecord &&
                  student.excuse_id
                ? "EXCUSED" as const
                : null;

        const presenceOnly =
          session?.mode === "PRESENCE_ONLY";

        const presenceStatus =
          attendanceExclusion ??
          (presenceOnly && !hasRecord
            ? "NOT_ARRIVED" as const
            : classifyTodayPresence({
            hasAttendanceRecord:
              hasRecord,
            presenceState:
              student.presence_state,
            schoolClock:
              clock.clock,
            checkInClosesAt:
              session &&
              policyDay
                ? policyDay.checkInClosesAt
                : null,
          }));

        return {
          studentId:
            student.student_id,
          casaStudentId:
            student.casa_student_id,
          admissionNumber:
            student.admission_number,
          academicSessionId:
            student.academic_session_id,
          firstName:
            student.first_name,
          middleName:
            student.middle_name,
          lastName:
            student.last_name,
          classArmId:
            student.class_arm_id,
          classArmName:
            student.class_arm_name,
          classLevelName:
            student.class_level_name,
          branchId:
            student.branch_id,
          branchName:
            student.branch_name,
          presenceStatus,
          arrivalStatus:
            presenceOnly
              ? null
              : student.punctuality_outcome ??
                student.arrival_status,
          arrivalMethod:
            student.arrival_method,
          officialStartTime:
            student.official_start_time,
          actualArrivalAt:
            student.actual_arrival_at,
          graceMinutesUsed:
            student.grace_minutes_used,
          minutesAfterOfficialStart:
            student.minutes_after_official_start,
          recordedAt:
            student.recorded_at,
          checkedOutAt:
            student.checked_out_at,
          earlyDeparturePreauthorized:
            student.early_departure_preauthorized,
          firstCardPendingHandover:
            Number(
              student.card_count ??
                0,
            ) === 1 &&
            Number(
              student.pending_count ??
                0,
            ) === 1 &&
            !student.card_replacement_case_id,
          cardReplacement:
            student.card_replacement_case_id
              ? {
                  reportedLostOn:
                    student.card_replacement_reported_lost_on ??
                    "",
                  replacementRequested:
                    Boolean(
                      student.card_replacement_requested_at,
                    ),
                }
              : null,
          departureResult:
            student.departure_result,
          attendanceExclusion,
          calendarEvent:
            student.calendar_event_id
              ? {
                  id:
                    student.calendar_event_id,
                  kind:
                    student.calendar_event_kind,
                  title:
                    student.calendar_event_title,
                }
              : null,
          excuse:
            !hasRecord &&
            student.excuse_id
              ? {
                  id:
                    student.excuse_id,
                  reason:
                    student.excuse_reason,
                }
              : null,
        };
      },
    );

  const eligible =
    session?.mode === "PRESENCE_ONLY"
      ? []
      : studentsWithState.filter(
          (student) =>
            student.attendanceExclusion ===
            null,
        );

  const summary = {
    expected:
      eligible.length,
    present:
      eligible.filter(
        (student) =>
          student.arrivalStatus !==
            null,
      ).length,
    onCampus:
      studentsWithState.filter(
        (student) =>
          student.presenceStatus ===
          "ON_CAMPUS",
      ).length,
    signedOut:
      studentsWithState.filter(
        (student) =>
          student.presenceStatus ===
          "SIGNED_OUT",
      ).length,
    onTime:
      eligible.filter(
        (student) =>
          student.arrivalStatus ===
          "ON_TIME",
      ).length,
    onTimeWithGrace:
      eligible.filter(
        (student) =>
          student.arrivalStatus ===
          "ON_TIME_WITH_GRACE",
      ).length,
    late:
      eligible.filter(
        (student) =>
          student.arrivalStatus ===
          "LATE",
      ).length,
    manual:
      eligible.filter(
        (student) =>
          student.arrivalStatus ===
          "MANUAL",
      ).length,
    notArrived:
      eligible.filter(
        (student) =>
          student.presenceStatus ===
          "NOT_ARRIVED",
      ).length,
    absent:
      eligible.filter(
        (student) =>
          student.presenceStatus ===
          "ABSENT",
      ).length,
    excused:
      studentsWithState.filter(
        (student) =>
          student.attendanceExclusion ===
          "EXCUSED",
      ).length,
    nonInstructional:
      studentsWithState.filter(
        (student) =>
          student.attendanceExclusion ===
          "NON_INSTRUCTIONAL",
      ).length,
    branchUnassigned:
      studentsWithState.filter(
        (student) =>
          student.attendanceExclusion ===
          "BRANCH_UNASSIGNED",
      ).length,
  };

  const normalizedQuery =
    input.query
      .trim()
      .toLowerCase();

  const requestedView:
    TodayAttendanceView =
      isTodayAttendanceView(
        input.view,
      )
        ? input.view
        : "ALL";

  const filtered =
    studentsWithState.filter(
      (student) => {
        if (
          normalizedQuery
        ) {
          const haystack =
            [
              student.casaStudentId,
              student.admissionNumber ??
                "",
              student.firstName,
              student.middleName ??
                "",
              student.lastName,
              student.classLevelName,
              student.classArmName,
              student.branchName ??
                "",
            ]
              .join(" ")
              .toLowerCase();

          if (
            !haystack.includes(
              normalizedQuery,
            )
          ) {
            return false;
          }
        }

        if (
          requestedView ===
          "PRESENT"
        ) {
          return (
            student.arrivalStatus !==
            null &&
            student.attendanceExclusion ===
              null
          );
        }

        if (
          requestedView ===
          "LATE"
        ) {
          return (
            student.arrivalStatus ===
            "LATE"
          );
        }

        if (
          requestedView ===
            "EXCUSED" ||
          requestedView ===
            "NON_INSTRUCTIONAL" ||
          requestedView ===
            "BRANCH_UNASSIGNED"
        ) {
          return (
            student.attendanceExclusion ===
            requestedView
          );
        }

        if (
          requestedView !==
            "ALL" &&
          student.presenceStatus !==
            requestedView
        ) {
          return false;
        }

        return true;
      },
    );

  const total =
    filtered.length;

  const start =
    (input.page - 1) *
    input.pageSize;

  const pageRows =
    filtered.slice(
      start,
      start +
        input.pageSize,
    );

  const terminalRows =
    rowsOf<{
      id:
        string;
      name:
        string;
      status:
        | "ACTIVE"
        | "SUSPENDED"
        | "REVOKED";
      last_seen_at:
        Date | string | null;
      branch_id:
        string | null;
      branch_name:
        string | null;
    }>(
      terminalResult,
    );

  const fiveMinutesAgo =
    Date.now() -
    5 * 60 * 1000;

  const terminalHealth = {
    total:
      terminalRows.length,
    active:
      terminalRows.filter(
        (terminal) =>
          terminal.status ===
          "ACTIVE",
      ).length,
    seenRecently:
      terminalRows.filter(
        (terminal) => {
          if (
            terminal.status !==
              "ACTIVE" ||
            !terminal.last_seen_at
          ) {
            return false;
          }

          return (
            new Date(
              terminal.last_seen_at,
            ).getTime() >=
            fiveMinutesAgo
          );
        },
      ).length,
    unassigned:
      terminalRows.filter(
        (terminal) =>
          !terminal.branch_id,
      ).length,
    terminals:
      terminalRows.map(
        (terminal) => ({
          id:
            terminal.id,
          name:
            terminal.name,
          status:
            terminal.status,
          lastSeenAt:
            terminal.last_seen_at,
          branchId:
            terminal.branch_id,
          branchName:
            terminal.branch_name,
        }),
      ),
  };

  const pendingRows =
    rowsOf<{
      attempt_id:
        string;
      student_id:
        string;
      casa_student_id:
        string;
      academic_session_id:
        string;
      first_name:
        string;
      middle_name:
        string | null;
      last_name:
        string;
      created_at:
        Date | string;
      reason_code:
        string | null;
      departure_result:
        string;
      branch_id:
        string | null;
    }>(
      pending,
    );

  const authorizationByAttempt =
    new Map(
      rowsOf<{
        attempt_id:
          string;
        reason:
          string | null;
      }>(
        authorizationRows,
      ).map(
        (authorization) => [
          authorization.attempt_id,
          authorization,
        ],
      ),
    );

  const earlyDepartures =
    pendingRows.map(
      (attempt) => {
        const authorization =
          authorizationByAttempt.get(
            attempt.attempt_id,
          ) ??
          null;

        return {
          attemptId:
            attempt.attempt_id,
          studentId:
            attempt.student_id,
          casaStudentId:
            attempt.casa_student_id,
          studentName:
            [
              attempt.first_name,
              attempt.middle_name,
              attempt.last_name,
            ]
              .filter(Boolean)
              .join(" "),
          createdAt:
            attempt.created_at,
          authorized:
            Boolean(
              authorization,
            ),
          reason:
            authorization?.reason ??
            null,
          branchId:
            attempt.branch_id,
        };
      },
    );

  const missingSignOutNotifications =
    Number(
      rowsOf<{
        missing_count:
          number;
      }>(
        exceptionResult,
      )[0]
        ?.missing_count ??
        0,
    );

  return {
    clock,
    todayDate: liveClock.date,
    readOnly,
    session,
    policyDay,
    branchId:
      input.branchId ??
      null,
    summary,
    page: {
      number:
        input.page,
      size:
        input.pageSize,
      total,
      pages:
        Math.max(
          1,
          Math.ceil(
            total /
            input.pageSize,
          ),
        ),
      view:
        requestedView,
      query:
        input.query,
    },
    students:
      pageRows,
    earlyDepartures,
    terminalHealth,
    exceptions: {
      signOutsWithoutGuardianOutbox:
        missingSignOutNotifications,
    },
  };
}