import { sql } from "drizzle-orm";

import { getDb } from "@/db";

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

export interface StudentAttendanceMetricCounts {
  onTime: number;
  late: number;
  manual: number;
  absent: number;
  excused: number;
  nonInstructional: number;
  pending: number;
}

function percentage(
  numerator: number,
  denominator: number,
) {
  if (denominator <= 0) {
    return null;
  }

  return Math.round(
    (
      numerator /
      denominator
    ) *
      10_000,
  ) / 100;
}

export function computeAttendanceMetrics(
  counts:
    StudentAttendanceMetricCounts,
) {
  const attendedDays =
    counts.onTime +
    counts.late +
    counts.manual;

  const eligibleDays =
    attendedDays +
    counts.absent;

  // MANUAL proves attendance, but does not prove the actual arrival
  // was on time. It therefore stays outside the punctuality denominator.
  const punctualityDenominator =
    counts.onTime +
    counts.late;

  return {
    eligibleDays,
    attendedDays,
    attendancePercentage:
      percentage(
        attendedDays,
        eligibleDays,
      ),
    punctualityPercentage:
      percentage(
        counts.onTime,
        punctualityDenominator,
      ),
    onTimeAttendanceRate:
      percentage(
        counts.onTime,
        eligibleDays,
      ),
    punctualityDenominator,
  };
}

function schoolLocalDate(
  timezone: string,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          timezone,
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
      },
    ).formatToParts(
      new Date(),
    );

  const values =
    Object.fromEntries(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
    );

  return `${values.year}-${values.month}-${values.day}`;
}

export async function getStudentAttendanceAnalytics(
  input: {
    schoolId: string;
    schoolTimezone: string;
    branchId: string;
    studentId: string;
    academicSessionId:
      string;
    academicTermId:
      string | null;
  },
) {
  const db = getDb();

  const scopeResult =
    await db.execute(sql`
      select
        student.id
          as student_id,
        student.casa_student_id,
        student.admission_number,
        student.first_name,
        student.middle_name,
        student.last_name,
        academic_session.id
          as academic_session_id,
        academic_session.name
          as academic_session_name,
        case
          when ${input.academicTermId}::uuid
            is null
            then academic_session.starts_on
          else academic_term.starts_on
        end as period_starts_on,
        case
          when ${input.academicTermId}::uuid
            is null
            then academic_session.ends_on
          else academic_term.ends_on
        end as period_ends_on,
        academic_term.id
          as academic_term_id,
        academic_term.name
          as academic_term_name
      from students student
      join academic_sessions
        academic_session
        on academic_session.school_id =
           student.school_id
       and academic_session.id =
           ${input.academicSessionId}::uuid
      left join academic_terms
        academic_term
        on academic_term.school_id =
           academic_session.school_id
       and academic_term.academic_session_id =
           academic_session.id
       and academic_term.id =
           ${input.academicTermId}::uuid
      where
        student.school_id =
          ${input.schoolId}::uuid
        and student.id =
          ${input.studentId}::uuid
        and (
          ${input.academicTermId}::uuid
            is null
          or academic_term.id is not null
        )
        and exists (
          select 1
          from student_enrollments
            enrollment
          join school_branch_class_arms
            branch_map
            on branch_map.school_id =
               enrollment.school_id
           and branch_map.class_arm_id =
               enrollment.class_arm_id
          where
            enrollment.school_id =
              student.school_id
            and enrollment.student_id =
              student.id
            and enrollment.academic_session_id =
              academic_session.id
            and branch_map.branch_id =
              ${input.branchId}::uuid
            and enrollment.starts_on <=
              case
                when ${input.academicTermId}::uuid
                  is null
                  then academic_session.ends_on
                else academic_term.ends_on
              end
            and (
              enrollment.ends_on is null
              or enrollment.ends_on >=
                 case
                   when ${input.academicTermId}::uuid
                     is null
                     then academic_session.starts_on
                   else academic_term.starts_on
                 end
            )
        )
      limit 1
    `);

  const scope =
    rowsOf<{
      student_id:
        string;
      casa_student_id:
        string;
      admission_number:
        string | null;
      first_name:
        string;
      middle_name:
        string | null;
      last_name:
        string;
      academic_session_id:
        string;
      academic_session_name:
        string;
      period_starts_on:
        string;
      period_ends_on:
        string;
      academic_term_id:
        string | null;
      academic_term_name:
        string | null;
    }>(
      scopeResult,
    )[0];

  if (!scope) {
    return null;
  }

  const rowsResult =
    await db.execute(sql`
      select
        attendance.id
          as attendance_session_id,
        attendance.attendance_date,
        attendance.status
          as session_status,
        enrollment.id
          as enrollment_id,
        branch_map.branch_id,
        level.name
          as class_level_name,
        arm.name
          as class_arm_name,
        record.id
          as attendance_record_id,
        record.status
          as arrival_status,
        record.recorded_at,
        record.presence_state,
        record.departure_result,
        record.checked_out_at,
        calendar.id
          as calendar_event_id,
        calendar.kind
          as calendar_event_kind,
        calendar.title
          as calendar_event_title,
        excuse.id
          as excuse_id,
        excuse.reason
          as excuse_reason
      from attendance_sessions
        attendance
      join lateral (
        select
          enrollment.id,
          enrollment.school_id,
          enrollment.class_arm_id
        from student_enrollments
          enrollment
        where
          enrollment.school_id =
            attendance.school_id
          and enrollment.student_id =
            ${input.studentId}::uuid
          and enrollment.academic_session_id =
            ${input.academicSessionId}::uuid
          and enrollment.starts_on <=
            attendance.attendance_date
          and (
            enrollment.ends_on is null
            or enrollment.ends_on >=
               attendance.attendance_date
          )
        order by
          enrollment.starts_on desc,
          enrollment.created_at desc
        limit 1
      ) enrollment
        on true
      join school_branch_class_arms
        branch_map
        on branch_map.school_id =
           enrollment.school_id
       and branch_map.class_arm_id =
           enrollment.class_arm_id
       and branch_map.branch_id =
           ${input.branchId}::uuid
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
      left join student_attendance_records
        record
        on record.school_id =
           attendance.school_id
       and record.session_id =
           attendance.id
       and record.student_id =
           ${input.studentId}::uuid
      left join lateral (
        select
          event.id,
          event.kind,
          event.title
        from school_calendar_events
          event
        where
          event.school_id =
            attendance.school_id
          and event.starts_on <=
            attendance.attendance_date
          and event.ends_on >=
            attendance.attendance_date
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
            attendance.school_id
          and approved.student_id =
            ${input.studentId}::uuid
          and approved.branch_id =
            branch_map.branch_id
          and approved.status =
            'ACTIVE'::student_attendance_excuse_status
          and approved.starts_on <=
            attendance.attendance_date
          and approved.ends_on >=
            attendance.attendance_date
        order by
          approved.created_at asc
        limit 1
      ) excuse
        on true
      where
        attendance.school_id =
          ${input.schoolId}::uuid
        and attendance.attendance_date >=
          ${scope.period_starts_on}::date
        and attendance.attendance_date <=
          ${scope.period_ends_on}::date
        and attendance.status in (
          'OPEN'::attendance_session_status,
          'CLOSED'::attendance_session_status
        )
      order by
        attendance.attendance_date asc
    `);

  const rawRows =
    rowsOf<{
      attendance_session_id:
        string;
      attendance_date:
        string;
      session_status:
        "OPEN" | "CLOSED";
      enrollment_id:
        string;
      branch_id:
        string;
      class_level_name:
        string;
      class_arm_name:
        string;
      attendance_record_id:
        string | null;
      arrival_status:
        | "ON_TIME"
        | "LATE"
        | "MANUAL"
        | null;
      recorded_at:
        Date | string | null;
      presence_state:
        | "ON_CAMPUS"
        | "SIGNED_OUT"
        | null;
      departure_result:
        string | null;
      checked_out_at:
        Date | string | null;
      calendar_event_id:
        string | null;
      calendar_event_kind:
        string | null;
      calendar_event_title:
        string | null;
      excuse_id:
        string | null;
      excuse_reason:
        string | null;
    }>(
      rowsResult,
    );

  const today =
    schoolLocalDate(
      input.schoolTimezone,
    );

  const counts:
    StudentAttendanceMetricCounts = {
      onTime: 0,
      late: 0,
      manual: 0,
      absent: 0,
      excused: 0,
      nonInstructional: 0,
      pending: 0,
    };

  let earlyDepartures =
    0;

  const trend =
    rawRows.map(
      (row) => {
        let status:
          | "ON_TIME"
          | "LATE"
          | "MANUAL"
          | "ABSENT"
          | "EXCUSED"
          | "NON_INSTRUCTIONAL"
          | "PENDING";

        // Calendar exclusions outrank normal grading even when a special
        // activity produced an attendance record. The actual arrival status
        // remains exposed separately for operational visibility.
        if (
          row.calendar_event_id
        ) {
          status =
            "NON_INSTRUCTIONAL";
          counts.nonInstructional +=
            1;
        } else if (
          row.arrival_status
        ) {
          status =
            row.arrival_status;

          if (
            row.arrival_status ===
            "ON_TIME"
          ) {
            counts.onTime +=
              1;
          } else if (
            row.arrival_status ===
            "LATE"
          ) {
            counts.late +=
              1;
          } else {
            counts.manual +=
              1;
          }
        } else if (
          row.excuse_id
        ) {
          status =
            "EXCUSED";
          counts.excused +=
            1;
        } else if (
          row.session_status ===
            "CLOSED" ||
          row.attendance_date <
            today
        ) {
          status =
            "ABSENT";
          counts.absent +=
            1;
        } else {
          status =
            "PENDING";
          counts.pending +=
            1;
        }

        if (
          row.departure_result ===
          "EARLY"
        ) {
          earlyDepartures +=
            1;
        }

        const running =
          computeAttendanceMetrics(
            counts,
          );

        return {
          date:
            row.attendance_date,
          status,
          actualArrivalStatus:
            row.arrival_status,
          recordedAt:
            row.recorded_at,
          checkedOutAt:
            row.checked_out_at,
          presenceState:
            row.presence_state,
          departureResult:
            row.departure_result,
          className:
            [
              row.class_level_name,
              row.class_arm_name,
            ]
              .filter(Boolean)
              .join(" "),
          calendarEvent:
            row.calendar_event_id
              ? {
                  id:
                    row.calendar_event_id,
                  kind:
                    row.calendar_event_kind,
                  title:
                    row.calendar_event_title,
                }
              : null,
          excuse:
            row.excuse_id &&
            !row.arrival_status
              ? {
                  id:
                    row.excuse_id,
                  reason:
                    row.excuse_reason,
                }
              : null,
          runningAttendancePercentage:
            running.attendancePercentage,
          runningPunctualityPercentage:
            running.punctualityPercentage,
        };
      },
    );

  const metrics =
    computeAttendanceMetrics(
      counts,
    );

  return {
    student: {
      id:
        scope.student_id,
      casaStudentId:
        scope.casa_student_id,
      admissionNumber:
        scope.admission_number,
      firstName:
        scope.first_name,
      middleName:
        scope.middle_name,
      lastName:
        scope.last_name,
      branchId:
        input.branchId,
    },
    period: {
      academicSessionId:
        scope.academic_session_id,
      academicSessionName:
        scope.academic_session_name,
      academicTermId:
        scope.academic_term_id,
      academicTermName:
        scope.academic_term_name,
      startsOn:
        scope.period_starts_on,
      endsOn:
        scope.period_ends_on,
    },
    counts,
    ...metrics,
    earlyDepartures,
    trend,
    grading: {
      punctualityGrade:
        null,
      note:
        "CASA provides the objective punctuality percentage and trend. School-specific grade thresholds can be configured later instead of hard-coding one universal grading scale.",
    },
  };
}
