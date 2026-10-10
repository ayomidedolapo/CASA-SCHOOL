import {
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  getTerminalAttendanceReadiness,
  getTerminalBranchAttendanceContext,
} from "@/server/attendance/branch-session";
import {
  attendanceNoStoreHeaders,
  terminalUnauthorizedResponse,
} from "@/server/attendance/http";
import {
  authenticateTerminalRequest,
} from "@/server/attendance/terminal-auth";

export const dynamic =
  "force-dynamic";

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

interface CachedCardRow {
  tokenHash: string;
  studentId: string;
  casaStudentId: string;
  firstName: string;
  middleName:
    string | null;
  lastName: string;
  presenceState:
    | "ON_CAMPUS"
    | "SIGNED_OUT"
    | null;
}

export async function GET(
  request: NextRequest,
) {
  const access =
    await authenticateTerminalRequest(
      request,
    );

  if (!access) {
    return terminalUnauthorizedResponse();
  }

  const active =
    await getTerminalBranchAttendanceContext({
      schoolId:
        access.school.id,
      terminalId:
        access.terminal.id,
      timezone:
        access.school.timezone,
    });

  const readiness =
    getTerminalAttendanceReadiness(
      active,
    );

  if (
    readiness ||
    !active.branch ||
    !active.session ||
    !active.session
      .branchSessionId ||
    active.session.status !==
      "OPEN"
  ) {
    return NextResponse.json(
      {
        code:
          readiness?.code ??
          "ATTENDANCE_NOT_OPEN",
        message:
          readiness?.message ??
          "Attendance is not open for continuity caching.",
      },
      {
        status: 409,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const db =
    getDb();

  const cards =
    rowsOf<CachedCardRow>(
      await db.execute(sql`
        select distinct on (
          card.token_hash
        )
          card.token_hash
            as "tokenHash",
          student.id::text
            as "studentId",
          student.casa_student_id
            as "casaStudentId",
          student.first_name
            as "firstName",
          student.middle_name
            as "middleName",
          student.last_name
            as "lastName",
          record.presence_state::text
            as "presenceState"
        from student_identity_cards
          card
        join students
          student
          on student.school_id =
             card.school_id
         and student.id =
             card.student_id
        join lateral (
          select
            enrollment.class_arm_id
          from student_enrollments
            enrollment
          where
            enrollment.school_id =
              student.school_id
            and enrollment.student_id =
              student.id
            and enrollment.status =
              'ACTIVE'
            and enrollment.starts_on <=
              ${active.clock.date}::date
            and (
              enrollment.ends_on
                is null
              or enrollment.ends_on >=
                 ${active.clock.date}::date
            )
          order by
            enrollment.starts_on
              desc,
            enrollment.created_at
              desc
          limit 1
        ) enrollment
          on true
        join school_branch_class_arms
          branch_arm
          on branch_arm.school_id =
             student.school_id
         and branch_arm.class_arm_id =
             enrollment.class_arm_id
         and branch_arm.branch_id =
             ${active.branch.id}::uuid
        left join student_attendance_records
          record
          on record.school_id =
             student.school_id
         and record.session_id =
             ${active.session.id}::uuid
         and record.student_id =
             student.id
        where
          card.school_id =
            ${access.school.id}::uuid
          and card.status =
            'ACTIVE'
          and student.status =
            'ACTIVE'
        order by
          card.token_hash,
          card.created_at
            desc
      `),
    );

  const now =
    new Date();

  const expiresAt =
    new Date(
      now.getTime() +
        12 *
          60 *
          60 *
          1000,
    );

  return NextResponse.json(
    {
      version: 1,
      serverTime:
        now.toISOString(),
      expiresAt:
        expiresAt.toISOString(),
      school: {
        id:
          access.school.id,
        slug:
          access.school.slug,
        name:
          access.school.name,
        timezone:
          access.school.timezone,
      },
      terminal: {
        id:
          access.terminal.id,
        name:
          access.terminal.name,
        terminalCode:
          access.terminal
            .terminalCode,
        credentialVersion:
          access.terminal
            .credentialVersion,
      },
      branch: {
        id:
          active.branch.id,
        name:
          active.branch.name,
        status:
          active.branch.status,
      },
      clock:
        active.clock,
      session: {
        id:
          active.session.id,
        status:
          "OPEN",
        mode:
          active.session.mode,
        attendanceDate:
          active.session
            .attendanceDate,
        policyId:
          active.session
            .policyId,
      },
      policyDay:
        active.policyDay
          ? {
              checkInOpensAt:
                active.policyDay
                  .checkInOpensAt,
              onTimeUntil:
                active.policyDay
                  .onTimeUntil,
              checkInClosesAt:
                active.policyDay
                  .checkInClosesAt,
              normalDismissalAt:
                active.policyDay
                  .normalDismissalAt,
              checkOutClosesAt:
                active.policyDay
                  .checkOutClosesAt,
            }
          : null,
      cards,
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}
