import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  attendanceEarlyDeparturePreauthorizations,
  attendanceSessions,
  attendanceVerificationAttempts,
  studentAttendanceRecords,
} from "@/db/schema";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";
import {
  consumePasskeyStepUpGrantWithId,
} from "@/server/auth/passkey-step-up";

import {
  getAttendanceScopeRejection,
  resolveAttendanceOperationalScope,
} from "./operational-scope";

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

function hasOrganizationAuthority(
  access: SchoolAccess,
) {
  return access.roles.some(
    (role) =>
      role === "OWNER" ||
      role === "ADMIN",
  );
}

function isSchoolTechnician(
  access: SchoolAccess,
) {
  return access.roles.includes(
    "SCHOOL_TECHNICIAN",
  );
}

async function canAuthorizeBranch(
  input: {
    access: SchoolAccess;
    branchId: string;
  },
) {
  if (
    hasOrganizationAuthority(
      input.access,
    )
  ) {
    return true;
  }

  const db = getDb();

  if (
    isSchoolTechnician(
      input.access,
    )
  ) {
    const technicianResult =
      await db.execute(sql`
        select
          assignment.id
        from school_branch_staff_assignments
          assignment
        join school_branches branch
          on branch.school_id =
             assignment.school_id
         and branch.id =
             assignment.branch_id
        where
          assignment.school_id =
            ${input.access.school.id}::uuid
          and assignment.branch_id =
            ${input.branchId}::uuid
          and assignment.membership_id =
            ${input.access.membership.id}::uuid
          and assignment.is_active = true
          and branch.status =
            'ACTIVE'::school_branch_status
        limit 1
      `);

    return (
      rowsOf<{
        id: string;
      }>(
        technicianResult,
      ).length === 1
    );
  }

  const result =
    await db.execute(sql`
      select
        assignment.id
      from school_branch_admin_assignments
        assignment
      join school_branches branch
        on branch.school_id =
           assignment.school_id
       and branch.id =
           assignment.branch_id
      where
        assignment.school_id =
          ${input.access.school.id}::uuid
        and assignment.branch_id =
          ${input.branchId}::uuid
        and assignment.membership_id =
          ${input.access.membership.id}::uuid
        and assignment.is_active = true
        and branch.status =
          'ACTIVE'::school_branch_status
      limit 1
    `);

  return (
    rowsOf<{
      id: string;
    }>(result).length ===
    1
  );
}

async function currentOnCampusCandidate(
  input: {
    schoolId: string;
    sessionId: string;
    attendanceDate: string;
    studentId: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        record.id
          as attendance_record_id,
        record.presence_state,
        branch.id
          as branch_id
      from student_attendance_records
        record
      join lateral (
        select
          enrollment.class_arm_id
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
            ${input.attendanceDate}::date
          and (
            enrollment.ends_on is null
            or enrollment.ends_on >=
               ${input.attendanceDate}::date
          )
        order by
          enrollment.starts_on desc,
          enrollment.created_at desc
        limit 1
      ) enrollment
        on true
      join school_branch_class_arms
        class_branch
        on class_branch.school_id =
           record.school_id
       and class_branch.class_arm_id =
           enrollment.class_arm_id
      join school_branches
        branch
        on branch.school_id =
           class_branch.school_id
       and branch.id =
           class_branch.branch_id
       and branch.status =
           'ACTIVE'::school_branch_status
      where
        record.school_id =
          ${input.schoolId}::uuid
        and record.session_id =
          ${input.sessionId}::uuid
        and record.student_id =
          ${input.studentId}::uuid
        and record.presence_state =
          'ON_CAMPUS'::attendance_presence_state
        and record.checked_out_at is null
      limit 1
    `);

  return rowsOf<{
    attendance_record_id:
      string;
    presence_state:
      "ON_CAMPUS";
    branch_id:
      string;
  }>(result)[0] ?? null;
}

export async function authorizeEarlyDeparture(
  input: {
    access:
      SchoolAccess;
    attemptId:
      string;
    reason:
      string;
    stepUpToken:
      string | null | undefined;
  },
) {
  const db = getDb();

  const candidates =
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
        outcome:
          attendanceVerificationAttempts.outcome,
        cardResult:
          attendanceVerificationAttempts.cardResult,
        departureResult:
          attendanceVerificationAttempts.departureResult,
        reasonCode:
          attendanceVerificationAttempts.reasonCode,
        sessionStatus:
          attendanceSessions.status,
        attendanceRecordId:
          studentAttendanceRecords.id,
        presenceState:
          studentAttendanceRecords.presenceState,
      })
      .from(
        attendanceVerificationAttempts,
      )
      .innerJoin(
        attendanceSessions,
        and(
          eq(
            attendanceSessions.schoolId,
            attendanceVerificationAttempts.schoolId,
          ),
          eq(
            attendanceSessions.id,
            attendanceVerificationAttempts.sessionId,
          ),
        ),
      )
      .innerJoin(
        studentAttendanceRecords,
        and(
          eq(
            studentAttendanceRecords.schoolId,
            attendanceVerificationAttempts.schoolId,
          ),
          eq(
            studentAttendanceRecords.sessionId,
            attendanceVerificationAttempts.sessionId,
          ),
          eq(
            studentAttendanceRecords.studentId,
            attendanceVerificationAttempts.studentId,
          ),
        ),
      )
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            input.access.school.id,
          ),
          eq(
            attendanceVerificationAttempts.id,
            input.attemptId,
          ),
        ),
      )
      .limit(1);

  const candidate =
    candidates[0];

  if (
    !candidate ||
    candidate.operation !==
      "CHECK_OUT" ||
    candidate.outcome !==
      "PENDING" ||
    candidate.cardResult !==
      "MATCHED" ||
    !candidate.studentId ||
    !candidate.cardId ||
    candidate.sessionStatus !==
      "OPEN" ||
    candidate.presenceState !==
      "ON_CAMPUS"
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "EARLY_DEPARTURE_NOT_AUTHORIZABLE",
    };
  }

  if (
    candidate.departureResult ===
      "EARLY" &&
    candidate.reasonCode ===
      null
  ) {
    return {
      ok: true as const,
      replayed: true,
      authorization: {
        attemptId:
          candidate.id,
      },
    };
  }

  if (
    candidate.departureResult !==
      "NOT_RUN" ||
    candidate.reasonCode !==
      "EARLY_DEPARTURE_AUTH_REQUIRED"
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "EARLY_DEPARTURE_NOT_PENDING_AUTHORIZATION",
    };
  }

  const operationalScope =
    await resolveAttendanceOperationalScope({
      schoolId:
        input.access.school.id,
      sessionId:
        candidate.sessionId,
      terminalId:
        candidate.terminalId,
      studentId:
        candidate.studentId,
    });

  const scopeRejection =
    getAttendanceScopeRejection(
      operationalScope,
      "CHECK_OUT",
    );

  if (scopeRejection) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        scopeRejection.code,
    };
  }

  if (
    !operationalScope?.studentBranchId ||
    !(
      await canAuthorizeBranch({
        access:
          input.access,
        branchId:
          operationalScope.studentBranchId,
      })
    )
  ) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "EARLY_DEPARTURE_AUTHORITY_REQUIRED",
    };
  }

  if (!input.stepUpToken) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "PASSKEY_STEP_UP_REQUIRED",
      requiredAction:
        "EARLY_DEPARTURE" as const,
    };
  }

  const passkeyGrantId =
    await consumePasskeyStepUpGrantWithId({
      token:
        input.stepUpToken,
      access:
        input.access,
      action:
        "EARLY_DEPARTURE",
    });

  if (!passkeyGrantId) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "PASSKEY_STEP_UP_REQUIRED",
      requiredAction:
        "EARLY_DEPARTURE" as const,
    };
  }

  const now =
    new Date().toISOString();

  const result =
    await db.execute(sql`
      with candidate as (
        select
          a.id as attempt_id,
          a.school_id,
          a.session_id,
          a.student_id,
          r.id as attendance_record_id
        from attendance_verification_attempts a
        join attendance_sessions s
          on s.school_id =
            a.school_id
          and s.id =
            a.session_id
        join student_attendance_records r
          on r.school_id =
            a.school_id
          and r.session_id =
            a.session_id
          and r.student_id =
            a.student_id
        join auth_passkey_step_up_grants pg
          on pg.id =
            ${passkeyGrantId}::uuid
          and pg.user_id =
            ${input.access.session.userId}::uuid
          and pg.school_id =
            a.school_id
          and pg.membership_id =
            ${input.access.membership.id}::uuid
          and pg.action =
            'EARLY_DEPARTURE'
          and pg.consumed_at is not null
        where
          a.school_id =
            ${input.access.school.id}::uuid
          and a.id =
            ${input.attemptId}::uuid
          and a.operation =
            'CHECK_OUT'::attendance_operation
          and a.outcome =
            'PENDING'::attendance_attempt_outcome
          and a.card_result =
            'MATCHED'::attendance_card_result
          and a.departure_result =
            'NOT_RUN'::attendance_departure_result
          and a.reason_code =
            'EARLY_DEPARTURE_AUTH_REQUIRED'
          and s.status =
            'OPEN'::attendance_session_status
          and r.presence_state =
            'ON_CAMPUS'::attendance_presence_state
          and r.checked_out_at is null
      ),
      inserted_authorization as (
        insert into attendance_early_departure_authorizations (
          school_id,
          session_id,
          attempt_id,
          student_id,
          attendance_record_id,
          authorized_by_membership_id,
          passkey_grant_id,
          authorization_method,
          reason,
          authorized_at,
          created_at
        )
        select
          candidate.school_id,
          candidate.session_id,
          candidate.attempt_id,
          candidate.student_id,
          candidate.attendance_record_id,
          ${input.access.membership.id}::uuid,
          ${passkeyGrantId}::uuid,
          'PASSKEY',
          ${input.reason},
          ${now}::timestamptz,
          ${now}::timestamptz
        from candidate
        on conflict (
          school_id,
          attempt_id
        )
        do nothing
        returning
          id,
          school_id,
          attempt_id,
          authorized_by_membership_id,
          reason,
          authorized_at
      ),
      updated_attempt as (
        update attendance_verification_attempts a
        set
          departure_result =
            'EARLY'::attendance_departure_result,
          manual_verified_by_membership_id =
            inserted_authorization.authorized_by_membership_id,
          reason_code = null
        from inserted_authorization
        where
          a.school_id =
            inserted_authorization.school_id
          and a.id =
            inserted_authorization.attempt_id
          and a.outcome =
            'PENDING'::attendance_attempt_outcome
        returning
          a.id
      )
      select
        inserted_authorization.id,
        inserted_authorization.attempt_id,
        inserted_authorization.reason,
        inserted_authorization.authorized_at
      from inserted_authorization
      where exists (
        select 1
        from updated_attempt
        where
          updated_attempt.id =
            inserted_authorization.attempt_id
      )
    `);

  const row =
    rowsOf<{
      id: string;
      attempt_id: string;
      reason: string;
      authorized_at: string;
    }>(result)[0];

  if (!row) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "EARLY_DEPARTURE_AUTHORIZATION_STATE_CHANGED",
    };
  }

  return {
    ok: true as const,
    replayed: false,
    authorization: row,
  };
}


export async function cancelEarlyDeparture(
  input: {
    access:
      SchoolAccess;
    attemptId:
      string;
    stepUpToken:
      string | null | undefined;
  },
) {
  const db = getDb();

  const candidateResult =
    await db.execute(sql`
      select
        attempt.id,
        attempt.terminal_id,
        attempt.student_id,
        attempt.card_result,
        attempt.operation,
        attempt.outcome,
        attempt.departure_result,
        attempt.reason_code,
        terminal_branch.branch_id
      from attendance_verification_attempts
        attempt
      left join school_branch_terminals
        terminal_branch
        on terminal_branch.school_id =
           attempt.school_id
       and terminal_branch.terminal_id =
           attempt.terminal_id
      where
        attempt.school_id =
          ${input.access.school.id}::uuid
        and attempt.id =
          ${input.attemptId}::uuid
      limit 1
    `);

  const candidate =
    rowsOf<{
      id: string;
      terminal_id:
        string;
      student_id:
        string | null;
      card_result:
        string;
      operation:
        string;
      outcome:
        string;
      departure_result:
        string;
      reason_code:
        string | null;
      branch_id:
        string | null;
    }>(
      candidateResult,
    )[0];

  const isPendingEarlyDeparture =
    candidate &&
    candidate.operation ===
      "CHECK_OUT" &&
    candidate.outcome ===
      "PENDING" &&
    candidate.card_result ===
      "MATCHED" &&
    (
      candidate.reason_code ===
        "EARLY_DEPARTURE_AUTH_REQUIRED" ||
      (
        candidate.departure_result ===
          "EARLY" &&
        candidate.reason_code ===
          null
      )
    );

  if (
    !candidate ||
    !isPendingEarlyDeparture ||
    !candidate.branch_id
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "EARLY_DEPARTURE_NOT_CANCELLABLE",
    };
  }

  if (
    !(
      await canAuthorizeBranch({
        access:
          input.access,
        branchId:
          candidate.branch_id,
      })
    )
  ) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "EARLY_DEPARTURE_AUTHORITY_REQUIRED",
    };
  }

  if (!input.stepUpToken) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "PASSKEY_STEP_UP_REQUIRED",
      requiredAction:
        "EARLY_DEPARTURE" as const,
    };
  }

  const passkeyGrantId =
    await consumePasskeyStepUpGrantWithId({
      token:
        input.stepUpToken,
      access:
        input.access,
      action:
        "EARLY_DEPARTURE",
    });

  if (!passkeyGrantId) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "PASSKEY_STEP_UP_REQUIRED",
      requiredAction:
        "EARLY_DEPARTURE" as const,
    };
  }

  const result =
    await db.execute(sql`
      with grant_check as (
        select grant.id
        from auth_passkey_step_up_grants
          grant
        where
          grant.id =
            ${passkeyGrantId}::uuid
          and grant.user_id =
            ${input.access.session.userId}::uuid
          and grant.school_id =
            ${input.access.school.id}::uuid
          and grant.membership_id =
            ${input.access.membership.id}::uuid
          and grant.action =
            'EARLY_DEPARTURE'
          and grant.consumed_at
            is not null
        limit 1
      ),
      updated as (
        update attendance_verification_attempts
          attempt
        set
          outcome =
            'REJECTED'::attendance_attempt_outcome,
          reason_code =
            'EARLY_DEPARTURE_CANCELLED_BY_STAFF',
          manual_verified_by_membership_id =
            ${input.access.membership.id}::uuid,
          completed_at =
            now()
        where
          attempt.school_id =
            ${input.access.school.id}::uuid
          and attempt.id =
            ${input.attemptId}::uuid
          and attempt.outcome =
            'PENDING'::attendance_attempt_outcome
          and attempt.operation =
            'CHECK_OUT'::attendance_operation
          and (
            attempt.reason_code =
              'EARLY_DEPARTURE_AUTH_REQUIRED'
            or
            (
              attempt.departure_result =
                'EARLY'::attendance_departure_result
              and attempt.reason_code
                is null
            )
          )
          and exists (
            select 1
            from grant_check
          )
        returning attempt.id
      ),
      cancelled_liveness as (
        update biometric_liveness_sessions
          session
        set
          status = 'FAILED',
          failure_code =
            'EARLY_DEPARTURE_CANCELLED_BY_STAFF',
          updated_at = now()
        from updated
        where
          session.school_id =
            ${input.access.school.id}::uuid
          and session.attempt_id =
            updated.id
          and session.purpose =
            'VERIFICATION'
          and session.status =
            'CREATED'
        returning session.id
      )
      select id
      from updated
    `);

  const cancelled =
    rowsOf<{
      id: string;
    }>(
      result,
    )[0];

  if (!cancelled) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "EARLY_DEPARTURE_CANCELLATION_STATE_CHANGED",
    };
  }

  return {
    ok: true as const,
    cancelled: true,
    attemptId:
      cancelled.id,
  };
}

export async function preauthorizeEarlyDepartures(
  input: {
    access:
      SchoolAccess;
    branchId:
      string;
    studentIds:
      string[];
    reason:
      string;
    stepUpToken:
      string | null | undefined;
  },
) {
  const db = getDb();

  if (
    !(
      await canAuthorizeBranch({
        access:
          input.access,
        branchId:
          input.branchId,
      })
    )
  ) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "EARLY_DEPARTURE_AUTHORITY_REQUIRED",
    };
  }

  const sessionResult =
    await db.execute(sql`
      select
        id,
        attendance_date
      from attendance_sessions
      where
        school_id =
          ${input.access.school.id}::uuid
        and status =
          'OPEN'::attendance_session_status
      order by attendance_date desc
      limit 1
    `);

  const session =
    rowsOf<{
      id: string;
      attendance_date:
        string;
    }>(sessionResult)[0];

  if (!session) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTENDANCE_SESSION_NOT_OPEN",
    };
  }

  const uniqueStudentIds =
    Array.from(
      new Set(
        input.studentIds,
      ),
    );

  const candidates:
    Array<{
      studentId: string;
      attendanceRecordId: string;
    }> = [];

  for (
    const studentId of
      uniqueStudentIds
  ) {
    const candidate =
      await currentOnCampusCandidate({
        schoolId:
          input.access.school.id,
        sessionId:
          session.id,
        attendanceDate:
          session.attendance_date,
        studentId,
      });

    if (
      !candidate ||
      candidate.branch_id !==
        input.branchId
    ) {
      return {
        ok: false as const,
        status: 409 as const,
        code:
          "EARLY_DEPARTURE_STUDENT_NOT_ELIGIBLE",
        studentId,
      };
    }

    candidates.push({
      studentId,
      attendanceRecordId:
        candidate.attendance_record_id,
    });
  }

  if (!input.stepUpToken) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "PASSKEY_STEP_UP_REQUIRED",
      requiredAction:
        "EARLY_DEPARTURE" as const,
    };
  }

  const passkeyGrantId =
    await consumePasskeyStepUpGrantWithId({
      token:
        input.stepUpToken,
      access:
        input.access,
      action:
        "EARLY_DEPARTURE",
    });

  if (!passkeyGrantId) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "PASSKEY_STEP_UP_REQUIRED",
      requiredAction:
        "EARLY_DEPARTURE" as const,
    };
  }

  const now =
    new Date();

  const inserted =
    await db
      .insert(
        attendanceEarlyDeparturePreauthorizations,
      )
      .values(
        candidates.map(
          (candidate) => ({
            schoolId:
              input.access.school.id,
            sessionId:
              session.id,
            studentId:
              candidate.studentId,
            attendanceRecordId:
              candidate.attendanceRecordId,
            authorizedByMembershipId:
              input.access.membership.id,
            passkeyGrantId,
            reason:
              input.reason,
            authorizedAt:
              now,
          }),
        ),
      )
      .onConflictDoNothing()
      .returning({
        id:
          attendanceEarlyDeparturePreauthorizations.id,
        studentId:
          attendanceEarlyDeparturePreauthorizations.studentId,
      });

  return {
    ok: true as const,
    requested:
      candidates.length,
    newlyAuthorized:
      inserted.length,
    alreadyAuthorized:
      candidates.length -
      inserted.length,
  };
}
