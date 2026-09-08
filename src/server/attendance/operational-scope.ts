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

export interface AttendanceOperationalScope {
  attendanceDate: string;
  terminalBranchId:
    string | null;
  terminalBranchName:
    string | null;
  terminalBranchStatus:
    "ACTIVE" | "INACTIVE" | null;
  studentBranchId:
    string | null;
  studentBranchName:
    string | null;
  studentBranchStatus:
    "ACTIVE" | "INACTIVE" | null;
  nonInstructionalEvent:
    | {
        id: string;
        kind:
          | "PUBLIC_HOLIDAY"
          | "SCHOOL_BREAK"
          | "BRANCH_CLOSURE"
          | "SPECIAL_NON_INSTRUCTIONAL_DAY";
        title: string;
      }
    | null;
}

export type AttendanceScopeRejection =
  | {
      code:
        "TERMINAL_BRANCH_UNASSIGNED";
      message: string;
      classification: string;
    }
  | {
      code:
        "STUDENT_BRANCH_UNRESOLVED";
      message: string;
      classification: string;
    }
  | {
      code:
        "BRANCH_INACTIVE";
      message: string;
      classification: string;
    }
  | {
      code:
        "TERMINAL_BRANCH_MISMATCH";
      message: string;
      classification: string;
    }
  | {
      code:
        "NON_INSTRUCTIONAL_DAY";
      message: string;
      classification: string;
    };

export async function resolveAttendanceOperationalScope(
  input: {
    schoolId: string;
    sessionId: string;
    terminalId: string;
    studentId: string;
  },
): Promise<
  AttendanceOperationalScope | null
> {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        attendance.attendance_date,
        terminal_map.branch_id
          as terminal_branch_id,
        terminal_branch.name
          as terminal_branch_name,
        terminal_branch.status
          as terminal_branch_status,
        student_map.branch_id
          as student_branch_id,
        student_branch.name
          as student_branch_name,
        student_branch.status
          as student_branch_status,
        calendar.id
          as calendar_event_id,
        calendar.kind
          as calendar_event_kind,
        calendar.title
          as calendar_event_title
      from attendance_sessions attendance
      left join school_branch_terminals
        terminal_map
        on terminal_map.school_id =
           attendance.school_id
       and terminal_map.terminal_id =
           ${input.terminalId}::uuid
      left join school_branches
        terminal_branch
        on terminal_branch.school_id =
           terminal_map.school_id
       and terminal_branch.id =
           terminal_map.branch_id
      left join lateral (
        select
          class_branch.branch_id
        from student_enrollments enrollment
        join school_branch_class_arms
          class_branch
          on class_branch.school_id =
             enrollment.school_id
         and class_branch.class_arm_id =
             enrollment.class_arm_id
        where
          enrollment.school_id =
            attendance.school_id
          and enrollment.student_id =
            ${input.studentId}::uuid
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
      ) student_map
        on true
      left join school_branches
        student_branch
        on student_branch.school_id =
           attendance.school_id
       and student_branch.id =
           student_map.branch_id
      left join lateral (
        select
          event.id,
          event.kind,
          event.title
        from school_calendar_events event
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
               terminal_map.branch_id
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
      where
        attendance.school_id =
          ${input.schoolId}::uuid
        and attendance.id =
          ${input.sessionId}::uuid
      limit 1
    `);

  const row =
    rowsOf<{
      attendance_date:
        string;
      terminal_branch_id:
        string | null;
      terminal_branch_name:
        string | null;
      terminal_branch_status:
        "ACTIVE" | "INACTIVE" | null;
      student_branch_id:
        string | null;
      student_branch_name:
        string | null;
      student_branch_status:
        "ACTIVE" | "INACTIVE" | null;
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
    }>(
      result,
    )[0];

  if (!row) {
    return null;
  }

  return {
    attendanceDate:
      row.attendance_date,
    terminalBranchId:
      row.terminal_branch_id,
    terminalBranchName:
      row.terminal_branch_name,
    terminalBranchStatus:
      row.terminal_branch_status,
    studentBranchId:
      row.student_branch_id,
    studentBranchName:
      row.student_branch_name,
    studentBranchStatus:
      row.student_branch_status,
    nonInstructionalEvent:
      row.calendar_event_id &&
      row.calendar_event_kind &&
      row.calendar_event_title
        ? {
            id:
              row.calendar_event_id,
            kind:
              row.calendar_event_kind,
            title:
              row.calendar_event_title,
          }
        : null,
  };
}

export function getAttendanceScopeRejection(
  scope:
    | AttendanceOperationalScope
    | null,
  operation:
    | "AUTO"
    | "CHECK_IN"
    | "CHECK_OUT",
): AttendanceScopeRejection | null {
  if (
    !scope ||
    !scope.terminalBranchId
  ) {
    return {
      code:
        "TERMINAL_BRANCH_UNASSIGNED",
      message:
        "This attendance terminal has not been assigned to a school branch.",
      classification:
        "TERMINAL_BRANCH_UNASSIGNED",
    };
  }

  if (!scope.studentBranchId) {
    return {
      code:
        "STUDENT_BRANCH_UNRESOLVED",
      message:
        "The student's enrollment is not assigned to a branch for this attendance date.",
      classification:
        "STUDENT_BRANCH_UNRESOLVED",
    };
  }

  if (
    scope.terminalBranchStatus !==
      "ACTIVE" ||
    scope.studentBranchStatus !==
      "ACTIVE"
  ) {
    return {
      code:
        "BRANCH_INACTIVE",
      message:
        "Attendance cannot be recorded through an inactive branch.",
      classification:
        "BRANCH_INACTIVE",
    };
  }

  if (
    scope.terminalBranchId !==
    scope.studentBranchId
  ) {
    return {
      code:
        "TERMINAL_BRANCH_MISMATCH",
      message:
        "This student belongs to another branch for this attendance date.",
      classification:
        "TERMINAL_BRANCH_MISMATCH",
    };
  }

  // AUTO deliberately receives only the branch/scope checks here.
  // Scanner AUTO can resolve to CHECK_IN or CHECK_OUT later in the
  // existing attendance flow. We must not guess that direction.
  //
  // A concrete CHECK_IN is blocked on a non-instructional day here.
  // For AUTO, the trusted finalization boundary re-runs this helper
  // using the resolved CHECK_IN/CHECK_OUT attempt operation before
  // any attendance write, so a holiday/break CHECK_IN still cannot commit.
  //
  // CHECK_OUT remains allowed so a student already on campus is never
  // stranded if the calendar changes after arrival.
  if (
    operation ===
      "CHECK_IN" &&
    scope.nonInstructionalEvent
  ) {
    return {
      code:
        "NON_INSTRUCTIONAL_DAY",
      message:
        `${scope.nonInstructionalEvent.title} is configured as a non-instructional day for this branch.`,
      classification:
        scope.nonInstructionalEvent.kind,
    };
  }

  return null;
}
