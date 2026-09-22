import {
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getDb,
} from "@/db";
import {
  attendanceNoStoreHeaders,
  terminalUnauthorizedResponse,
} from "@/server/attendance/http";
import {
  authenticateTerminalRequest,
} from "@/server/attendance/terminal-auth";
import {
  getActiveTerminalSession,
} from "@/server/attendance/terminal-session";

export const dynamic =
  "force-dynamic";

function rowsOf<T>(
  result: unknown,
): T[] {
  if (
    Array.isArray(
      result,
    )
  ) {
    return result as T[];
  }

  if (
    result &&
    typeof result ===
      "object" &&
    "rows" in result
  ) {
    const rows =
      (
        result as {
          rows?: unknown;
        }
      ).rows;

    if (
      Array.isArray(
        rows,
      )
    ) {
      return rows as T[];
    }
  }

  return [];
}

type PendingRow = {
  id: string;
  operation:
    | "CHECK_IN"
    | "CHECK_OUT";
  card_result: string;
  time_result: string;
  departure_result:
    string;
  outcome: string;
  reason_code:
    string | null;
  completed_at:
    string | null;
  student_id: string;
  casa_student_id:
    string;
  first_name: string;
  middle_name:
    string | null;
  last_name: string;
  school_name: string;
  branch_name:
    string | null;
  class_name:
    string | null;
  sex:
    string | null;
  has_early_authorization:
    boolean;
};

export async function GET(
  request:
    NextRequest,
) {
  const access =
    await authenticateTerminalRequest(
      request,
    );

  if (!access) {
    return terminalUnauthorizedResponse();
  }

  const active =
    await getActiveTerminalSession(
      access.school.id,
      access.school.timezone,
    );

  if (!active.session) {
    return NextResponse.json(
      {
        pending:
          null,
        duplicatePendingCount:
          0,
      },
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const result =
    await getDb()
      .execute(sql`
        select
          attempt.id::text
            as id,
          attempt.operation::text
            as operation,
          attempt.card_result::text
            as card_result,
          attempt.time_result::text
            as time_result,
          attempt.departure_result::text
            as departure_result,
          attempt.outcome::text
            as outcome,
          attempt.reason_code
            as reason_code,
          attempt.completed_at
            as completed_at,
          student.id::text
            as student_id,
          student.casa_student_id
            as casa_student_id,
          student.first_name
            as first_name,
          student.middle_name
            as middle_name,
          student.last_name
            as last_name,
          school.name
            as school_name,
          branch_detail.branch_name
            as branch_name,
          case
            when level.name is null
              and arm.name is null
              then null
            else
              concat_ws(
                ' ',
                level.name,
                arm.name
              )
          end as class_name,
          student.sex::text
            as sex,
          exists (
            select 1
            from attendance_early_departure_authorizations authorization
            where
              authorization.school_id =
                attempt.school_id
              and authorization.attempt_id =
                attempt.id
          ) as has_early_authorization
        from attendance_verification_attempts attempt
        join schools school
          on school.id =
             attempt.school_id
        join students student
          on student.school_id =
             attempt.school_id
         and student.id =
             attempt.student_id
        left join lateral (
          select
            enrollment.class_arm_id
          from student_enrollments enrollment
          where
            enrollment.school_id =
              attempt.school_id
            and enrollment.student_id =
              attempt.student_id
            and enrollment.status =
              'ACTIVE'::student_enrollment_status
          order by
            enrollment.created_at desc
          limit 1
        ) active_enrollment
          on true
        left join class_arms arm
          on arm.school_id =
             attempt.school_id
         and arm.id =
             active_enrollment.class_arm_id
        left join class_levels level
          on level.school_id =
             arm.school_id
         and level.id =
             arm.class_level_id
        left join lateral (
          select
            branch.name
              as branch_name
          from school_branch_class_arms mapping
          join school_branches branch
            on branch.school_id =
               mapping.school_id
           and branch.id =
               mapping.branch_id
          where
            mapping.school_id =
              attempt.school_id
            and mapping.class_arm_id =
              active_enrollment.class_arm_id
          order by
            branch.name asc
          limit 1
        ) branch_detail
          on true
        where
          attempt.school_id =
            ${access.school.id}::uuid
          and attempt.terminal_id =
            ${access.terminal.id}::uuid
          and attempt.session_id =
            ${active.session.id}::uuid
          and attempt.card_result =
            'MATCHED'::attendance_card_result
          and attempt.outcome =
            'PENDING'::attendance_attempt_outcome
          and (
            (
              attempt.operation =
                'CHECK_IN'::attendance_operation
              and not exists (
                select 1
                from student_attendance_records record
                where
                  record.school_id =
                    attempt.school_id
                  and record.session_id =
                    attempt.session_id
                  and record.student_id =
                    attempt.student_id
              )
            )
            or
            (
              attempt.operation =
                'CHECK_OUT'::attendance_operation
              and exists (
                select 1
                from student_attendance_records record
                where
                  record.school_id =
                    attempt.school_id
                  and record.session_id =
                    attempt.session_id
                  and record.student_id =
                    attempt.student_id
                  and record.presence_state =
                    'ON_CAMPUS'::attendance_presence_state
                  and record.checked_out_at
                    is null
              )
            )
          )
        order by
          attempt.created_at desc
        limit 10
      `);

  const rows =
    rowsOf<PendingRow>(
      result,
    );

  const latest =
    rows[0];

  if (!latest) {
    return NextResponse.json(
      {
        pending:
          null,
        duplicatePendingCount:
          0,
      },
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const earlyAuthorized =
    latest.operation ===
      "CHECK_OUT" &&
    latest.departure_result ===
      "EARLY" &&
    latest.reason_code ===
      null &&
    latest
      .has_early_authorization;

  const requiresStaffAuthorization =
    latest.reason_code ===
      "EARLY_DEPARTURE_AUTH_REQUIRED";

  const requiresBiometric =
    latest.operation ===
      "CHECK_IN" ||
    latest.departure_result ===
      "NORMAL" ||
    earlyAuthorized;

  return NextResponse.json(
    {
      pending: {
        attempt: {
          id:
            latest.id,
          operation:
            latest.operation,
          cardResult:
            latest.card_result,
          timeResult:
            latest.time_result,
          departureResult:
            latest.departure_result,
          outcome:
            latest.outcome,
          reasonCode:
            latest.reason_code,
          completedAt:
            latest.completed_at,
        },
        student: {
          id:
            latest.student_id,
          casaStudentId:
            latest.casa_student_id,
          firstName:
            latest.first_name,
          middleName:
            latest.middle_name,
          lastName:
            latest.last_name,
          schoolName:
            latest.school_name,
          branchName:
            latest.branch_name,
          className:
            latest.class_name,
          sex:
            latest.sex,
        },
        replayed:
          true,
        requiresBiometric,
        requiresStaffAuthorization,
        classification:
          null,
      },
      duplicatePendingCount:
        rows.length,
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}
