import {
  and,
  eq,
  isNull,
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  attendanceEarlyDeparturePreauthorizations,
  attendanceVerificationAttempts,
  studentAttendanceRecords,
  studentIdentityCards,
  students,
} from "@/db/schema";
import {
  attendanceNoStoreHeaders,
  terminalUnauthorizedResponse,
} from "@/server/attendance/http";
import {
  classifyCheckIn,
  classifyCheckOut,
} from "@/server/attendance/presence";
import {
  parseStudentCardPayload,
} from "@/server/attendance/scan";
import {
  resolveTerminalScanOperation,
} from "@/server/attendance/scan-operation";
import {
  authenticateTerminalRequest,
} from "@/server/attendance/terminal-auth";
import {
  getActiveTerminalSession,
} from "@/server/attendance/terminal-session";
import {
  getAttendanceScopeRejection,
  resolveAttendanceOperationalScope,
} from "@/server/attendance/operational-scope";
import {
  terminalScanSchema,
} from "@/server/attendance/validation";

export const dynamic =
  "force-dynamic";

type AttemptResult = {
  id: string;
  operation:
    | "CHECK_IN"
    | "CHECK_OUT";
  cardResult: string;
  timeResult: string;
  departureResult: string;
  outcome: string;
  reasonCode: string | null;
  studentId: string | null;
  cardId: string | null;
  completedAt: Date | null;
};

function rowsOf<T>(r:unknown):T[]{if(Array.isArray(r))return r as T[];if(r&&typeof r==="object"&&"rows" in r&&Array.isArray((r as {rows?:unknown}).rows))return (r as {rows:T[]}).rows;return []}

async function studentDisplayDetail(db:ReturnType<typeof getDb>,schoolId:string,studentId:string){return rowsOf<{schoolName:string;branchName:string|null;className:string|null;sex:string|null}>(await db.execute(sql`select sc.name as "schoolName",b.name as "branchName",concat_ws(' ',cl.name,ca.name) as "className",s.sex::text as sex from students s join schools sc on sc.id=s.school_id left join lateral(select e.class_arm_id from student_enrollments e where e.school_id=s.school_id and e.student_id=s.id and e.status='ACTIVE' order by e.created_at desc limit 1) e on true left join class_arms ca on ca.school_id=s.school_id and ca.id=e.class_arm_id left join class_levels cl on cl.school_id=ca.school_id and cl.id=ca.class_level_id left join school_branch_class_arms ba on ba.school_id=s.school_id and ba.class_arm_id=ca.id left join school_branches b on b.school_id=s.school_id and b.id=ba.branch_id where s.school_id=${schoolId}::uuid and s.id=${studentId}::uuid limit 1`))[0]??null}

function attemptResponse(
  attempt: AttemptResult,
  options?: {
    student?: {
      id: string;
      casaStudentId: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
      schoolName?: string;
      branchName?: string | null;
      className?: string | null;
      sex?: string | null;
    } | null;
    replayed?: boolean;
    requiresBiometric?: boolean;
    requiresStaffAuthorization?: boolean;
    classification?: string | null;
  },
) {
  return {
    attempt: {
      id: attempt.id,
      operation:
        attempt.operation,
      cardResult:
        attempt.cardResult,
      timeResult:
        attempt.timeResult,
      departureResult:
        attempt.departureResult,
      outcome:
        attempt.outcome,
      reasonCode:
        attempt.reasonCode,
      completedAt:
        attempt.completedAt,
    },
    student:
      options?.student ?? null,
    replayed:
      options?.replayed ?? false,
    requiresBiometric:
      options?.requiresBiometric ??
      false,
    requiresStaffAuthorization:
      options?.requiresStaffAuthorization ??
      false,
    classification:
      options?.classification ??
      null,
  };
}

export async function POST(
  request: NextRequest,
) {
  const access =
    await authenticateTerminalRequest(
      request,
    );

  if (!access) {
    return terminalUnauthorizedResponse();
  }

  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        message:
          "Invalid scan request.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const parsed =
    terminalScanSchema.safeParse(
      body,
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          "Invalid scan request.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const cardCredential =
    parseStudentCardPayload(
      parsed.data.qrPayload,
    );

  if (!cardCredential) {
    return NextResponse.json(
      {
        message:
          "Invalid CASA student card.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const active =
    await getActiveTerminalSession(
      access.school.id,
      access.school.timezone,
    );

  if (
    !active.session ||
    !active.policyDay
  ) {
    return NextResponse.json(
      {
        message:
          "No active attendance session is available for this terminal.",
        code:
          "NO_ACTIVE_SESSION",
      },
      {
        status: 409,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const db = getDb();

  const existingAttempts =
    await db
      .select({
        id:
          attendanceVerificationAttempts.id,
        operation:
          attendanceVerificationAttempts.operation,
        cardResult:
          attendanceVerificationAttempts.cardResult,
        timeResult:
          attendanceVerificationAttempts.timeResult,
        departureResult:
          attendanceVerificationAttempts.departureResult,
        outcome:
          attendanceVerificationAttempts.outcome,
        reasonCode:
          attendanceVerificationAttempts.reasonCode,
        studentId:
          attendanceVerificationAttempts.studentId,
        cardId:
          attendanceVerificationAttempts.cardId,
        completedAt:
          attendanceVerificationAttempts.completedAt,
      })
      .from(
        attendanceVerificationAttempts,
      )
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            access.school.id,
          ),
          eq(
            attendanceVerificationAttempts.terminalId,
            access.terminal.id,
          ),
          eq(
            attendanceVerificationAttempts.terminalRequestId,
            parsed.data.requestId,
          ),
        ),
      )
      .limit(1);

  const existingAttempt =
    existingAttempts[0];

  if (existingAttempt) {
    let student = null;

    if (
      existingAttempt.studentId
    ) {
      const studentRows =
        await db
          .select({
            id:
              students.id,
            casaStudentId:
              students.casaStudentId,
            firstName:
              students.firstName,
            middleName:
              students.middleName,
            lastName:
              students.lastName,
          })
          .from(students)
          .where(
            and(
              eq(
                students.schoolId,
                access.school.id,
              ),
              eq(
                students.id,
                existingAttempt.studentId,
              ),
            ),
          )
          .limit(1);

      student =
        studentRows[0] ?? null;
      if(student){
        const detail=await studentDisplayDetail(db,access.school.id,student.id);
        student={...student,...(detail??{}),schoolName:detail?.schoolName??access.school.name};
      }
    }

    return NextResponse.json(
      attemptResponse(
        existingAttempt,
        {
          student,
          replayed: true,
          requiresBiometric:
            existingAttempt.outcome ===
            "PENDING",
        },
      ),
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const cardRows =
    await db
      .select({
        cardId:
          studentIdentityCards.id,
        cardStatus:
          studentIdentityCards.status,
        studentId:
          students.id,
        studentStatus:
          students.status,
        casaStudentId:
          students.casaStudentId,
        firstName:
          students.firstName,
        middleName:
          students.middleName,
        lastName:
          students.lastName,
      })
      .from(
        studentIdentityCards,
      )
      .innerJoin(
        students,
        and(
          eq(
            studentIdentityCards.schoolId,
            students.schoolId,
          ),
          eq(
            studentIdentityCards.studentId,
            students.id,
          ),
        ),
      )
      .where(
        and(
          eq(
            studentIdentityCards.schoolId,
            access.school.id,
          ),
          eq(
            studentIdentityCards.tokenHash,
            cardCredential.tokenHash,
          ),
        ),
      )
      .limit(1);

  const card =
    cardRows[0];

  const now =
    new Date();

  let cardResult:
    | "MATCHED"
    | "UNKNOWN_CARD"
    | "INACTIVE_CARD" =
      "UNKNOWN_CARD";

  let timeResult:
    | "NOT_RUN"
    | "ON_TIME"
    | "LATE"
    | "OUTSIDE_WINDOW" =
      "NOT_RUN";

  let departureResult:
    | "NOT_RUN"
    | "NORMAL"
    | "EARLY"
    | "OUTSIDE_WINDOW" =
      "NOT_RUN";

  let outcome:
    | "PENDING"
    | "REJECTED" =
      "PENDING";

  let reasonCode:
    string | null = null;

  let classification:
    string | null = null;

  let manualVerifiedByMembershipId:
    string | null = null;

  let earlyPreauthorization:
    | {
        id: string;
        attendanceRecordId: string;
        authorizedByMembershipId: string;
        passkeyGrantId: string;
        reason: string;
      }
    | null = null;

  let requiresStaffAuthorization =
    false;

  let resolvedOperation:
    | "CHECK_IN"
    | "CHECK_OUT" =
      parsed.data.operation ===
        "AUTO"
        ? "CHECK_IN"
        : parsed.data.operation;

  if (!card) {
    outcome = "REJECTED";
    reasonCode =
      "UNKNOWN_CARD";
  } else if (
    card.cardStatus !== "ACTIVE"
  ) {
    cardResult =
      "INACTIVE_CARD";
    outcome = "REJECTED";
    reasonCode =
      "CARD_NOT_ACTIVE";
  } else {
    cardResult = "MATCHED";

    if (
      card.studentStatus !==
      "ACTIVE"
    ) {
      outcome = "REJECTED";
      reasonCode =
        "STUDENT_NOT_ACTIVE";
    }
  }  if (
    card &&
    outcome === "PENDING"
  ) {
    const operationalScope =
      await resolveAttendanceOperationalScope({
        schoolId:
          access.school.id,
        sessionId:
          active.session.id,
        terminalId:
          access.terminal.id,
        studentId:
          card.studentId,
      });

    const scopeRejection =
      getAttendanceScopeRejection(
        operationalScope,
        parsed.data.operation,
      );

    if (scopeRejection) {
      outcome =
        "REJECTED";
      reasonCode =
        scopeRejection.code;
      classification =
        scopeRejection.classification;
    }
  }



  if (
    card &&
    outcome === "PENDING"
  ) {
    const existingRecords =
      await db
        .select({
          id:
            studentAttendanceRecords.id,
          presenceState:
            studentAttendanceRecords.presenceState,
        })
        .from(
          studentAttendanceRecords,
        )
        .where(
          and(
            eq(
              studentAttendanceRecords.schoolId,
              access.school.id,
            ),
            eq(
              studentAttendanceRecords.sessionId,
              active.session.id,
            ),
            eq(
              studentAttendanceRecords.studentId,
              card.studentId,
            ),
          ),
        )
        .limit(1);

    const record =
      existingRecords[0];

    resolvedOperation =
      resolveTerminalScanOperation(
        parsed.data.operation,
        record?.presenceState ??
          null,
      );

    if (
      resolvedOperation ===
      "CHECK_IN"
    ) {
      classification =
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
        "ON_TIME"
      ) {
        timeResult =
          "ON_TIME";
      } else if (
        classification ===
        "LATE"
      ) {
        timeResult =
          "LATE";
      } else {
        timeResult =
          "OUTSIDE_WINDOW";
        outcome =
          "REJECTED";
        reasonCode =
          classification ===
          "BEFORE_WINDOW"
            ? "CHECK_IN_NOT_OPEN"
            : "CHECK_IN_WINDOW_CLOSED";
      }

      if (
        outcome === "PENDING" &&
        record?.presenceState ===
          "ON_CAMPUS"
      ) {
        outcome =
          "REJECTED";
        reasonCode =
          "ALREADY_CHECKED_IN";
      }

      if (
        outcome === "PENDING" &&
        record?.presenceState ===
          "SIGNED_OUT"
      ) {
        outcome =
          "REJECTED";
        reasonCode =
          "REENTRY_NOT_ENABLED";
      }
    } else {
      classification =
        classifyCheckOut(
          active.clock.clock,
          active.policyDay
            .normalDismissalAt,
          active.policyDay
            .checkOutClosesAt,
        );

      if (!record) {
        outcome =
          "REJECTED";
        reasonCode =
          "NOT_CHECKED_IN";
      } else if (
        record.presenceState ===
        "SIGNED_OUT"
      ) {
        outcome =
          "REJECTED";
        reasonCode =
          "ALREADY_SIGNED_OUT";
      } else if (
        classification ===
        "NORMAL"
      ) {
        departureResult =
          "NORMAL";
      } else if (
        classification ===
        "EARLY"
      ) {
        const preauthorizationRows =
          await db
            .select({
              id:
                attendanceEarlyDeparturePreauthorizations.id,
              attendanceRecordId:
                attendanceEarlyDeparturePreauthorizations.attendanceRecordId,
              authorizedByMembershipId:
                attendanceEarlyDeparturePreauthorizations.authorizedByMembershipId,
              passkeyGrantId:
                attendanceEarlyDeparturePreauthorizations.passkeyGrantId,
              reason:
                attendanceEarlyDeparturePreauthorizations.reason,
            })
            .from(
              attendanceEarlyDeparturePreauthorizations,
            )
            .where(
              and(
                eq(
                  attendanceEarlyDeparturePreauthorizations.schoolId,
                  access.school.id,
                ),
                eq(
                  attendanceEarlyDeparturePreauthorizations.sessionId,
                  active.session.id,
                ),
                eq(
                  attendanceEarlyDeparturePreauthorizations.studentId,
                  card.studentId,
                ),
                isNull(
                  attendanceEarlyDeparturePreauthorizations.consumedAttemptId,
                ),
                isNull(
                  attendanceEarlyDeparturePreauthorizations.revokedAt,
                ),
              ),
            )
            .limit(1);

        earlyPreauthorization =
          preauthorizationRows[0] ??
          null;

        if (
          earlyPreauthorization &&
          earlyPreauthorization.attendanceRecordId ===
            record.id
        ) {
          departureResult =
            "EARLY";
          manualVerifiedByMembershipId =
            earlyPreauthorization.authorizedByMembershipId;
          requiresStaffAuthorization =
            false;
          reasonCode =
            null;
        } else {
          earlyPreauthorization =
            null;
          requiresStaffAuthorization =
            true;
          reasonCode =
            "EARLY_DEPARTURE_AUTH_REQUIRED";
        }
      } else {
        departureResult =
          "OUTSIDE_WINDOW";
        outcome =
          "REJECTED";
        reasonCode =
          "CHECK_OUT_WINDOW_CLOSED";
      }
    }
  }

  const completedAt =
    outcome === "REJECTED"
      ? now
      : null;

  const inserted =
    await db
      .insert(
        attendanceVerificationAttempts,
      )
      .values({
        schoolId:
          access.school.id,
        sessionId:
          active.session.id,
        terminalId:
          access.terminal.id,
        terminalRequestId:
          parsed.data.requestId,
        studentId:
          card?.studentId ??
          null,
        cardId:
          card?.cardId ?? null,
        scannedTokenHash:
          cardCredential.tokenHash,
        operation:
          resolvedOperation,
        cardResult,
        timeResult,
        departureResult,
        outcome,
        reasonCode,
        manualVerifiedByMembershipId,
        occurredAt: now,
        completedAt,
      })
      .onConflictDoNothing()
      .returning({
        id:
          attendanceVerificationAttempts.id,
        operation:
          attendanceVerificationAttempts.operation,
        cardResult:
          attendanceVerificationAttempts.cardResult,
        timeResult:
          attendanceVerificationAttempts.timeResult,
        departureResult:
          attendanceVerificationAttempts.departureResult,
        outcome:
          attendanceVerificationAttempts.outcome,
        reasonCode:
          attendanceVerificationAttempts.reasonCode,
        studentId:
          attendanceVerificationAttempts.studentId,
        cardId:
          attendanceVerificationAttempts.cardId,
        completedAt:
          attendanceVerificationAttempts.completedAt,
      });

  let attempt =
    inserted[0];

  if (!attempt) {
    const raced =
      await db
        .select({
          id:
            attendanceVerificationAttempts.id,
          operation:
            attendanceVerificationAttempts.operation,
          cardResult:
            attendanceVerificationAttempts.cardResult,
          timeResult:
            attendanceVerificationAttempts.timeResult,
          departureResult:
            attendanceVerificationAttempts.departureResult,
          outcome:
            attendanceVerificationAttempts.outcome,
          reasonCode:
            attendanceVerificationAttempts.reasonCode,
          studentId:
            attendanceVerificationAttempts.studentId,
          cardId:
            attendanceVerificationAttempts.cardId,
          completedAt:
            attendanceVerificationAttempts.completedAt,
        })
        .from(
          attendanceVerificationAttempts,
        )
        .where(
          and(
            eq(
              attendanceVerificationAttempts.schoolId,
              access.school.id,
            ),
            eq(
              attendanceVerificationAttempts.terminalId,
              access.terminal.id,
            ),
            eq(
              attendanceVerificationAttempts.terminalRequestId,
              parsed.data.requestId,
            ),
          ),
        )
        .limit(1);

    attempt =
      raced[0];
  }

  if (!attempt) {
    throw new Error(
      "Unable to create or resolve terminal verification attempt.",
    );
  }


  if (
    earlyPreauthorization &&
    attempt.outcome ===
      "PENDING" &&
    attempt.operation ===
      "CHECK_OUT" &&
    attempt.studentId
  ) {
    const claimResult =
      await db.execute(sql`
        with claimed as (
          update attendance_early_departure_preauthorizations
          set
            consumed_attempt_id =
              ${attempt.id}::uuid,
            consumed_at =
              ${now.toISOString()}::timestamptz
          where
            school_id =
              ${access.school.id}::uuid
            and id =
              ${earlyPreauthorization.id}::uuid
            and session_id =
              ${active.session.id}::uuid
            and student_id =
              ${attempt.studentId}::uuid
            and attendance_record_id =
              ${earlyPreauthorization.attendanceRecordId}::uuid
            and consumed_attempt_id is null
            and revoked_at is null
          returning
            school_id,
            session_id,
            student_id,
            attendance_record_id,
            authorized_by_membership_id,
            passkey_grant_id,
            reason,
            authorized_at
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
            claimed.school_id,
            claimed.session_id,
            ${attempt.id}::uuid,
            claimed.student_id,
            claimed.attendance_record_id,
            claimed.authorized_by_membership_id,
            claimed.passkey_grant_id,
            'PASSKEY',
            claimed.reason,
            claimed.authorized_at,
            ${now.toISOString()}::timestamptz
          from claimed
          on conflict (
            school_id,
            attempt_id
          )
          do nothing
          returning id
        )
        select
          count(*)::int
            as claimed_count
        from inserted_authorization
      `);

    const claimRows =
      rowsOf<{
        claimed_count:
          number;
      }>(
        claimResult,
      );

    if (
      Number(
        claimRows[0]
          ?.claimed_count ??
          0,
      ) !== 1
    ) {
      await db
        .update(
          attendanceVerificationAttempts,
        )
        .set({
          outcome:
            "REJECTED",
          reasonCode:
            "EARLY_DEPARTURE_PREAUTHORIZATION_ALREADY_USED",
          completedAt:
            now,
        })
        .where(
          and(
            eq(
              attendanceVerificationAttempts.schoolId,
              access.school.id,
            ),
            eq(
              attendanceVerificationAttempts.id,
              attempt.id,
            ),
            eq(
              attendanceVerificationAttempts.outcome,
              "PENDING",
            ),
          ),
        );

      attempt = {
        ...attempt,
        outcome:
          "REJECTED",
        reasonCode:
          "EARLY_DEPARTURE_PREAUTHORIZATION_ALREADY_USED",
        completedAt:
          now,
      };
    }
  }

  const student =
    card &&
    cardResult === "MATCHED"
      ? {
          id: card.studentId,
          casaStudentId: card.casaStudentId,
          firstName: card.firstName,
          middleName: card.middleName,
          lastName: card.lastName,
          ...(await studentDisplayDetail(db,access.school.id,card.studentId) ?? {}),
          schoolName: access.school.name,
        }
      : null;

  return NextResponse.json(
    attemptResponse(
      attempt,
      {
        student,
        requiresBiometric:
          attempt.outcome ===
          "PENDING",
        requiresStaffAuthorization,
        classification,
      },
    ),
    {
      status:
        attempt.outcome ===
        "REJECTED"
          ? 409
          : 200,
      headers:
        attendanceNoStoreHeaders,
    },
  );
}