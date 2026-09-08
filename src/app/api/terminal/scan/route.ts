import {
  and,
  eq,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
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

function attemptResponse(
  attempt: AttemptResult,
  options?: {
    student?: {
      id: string;
      casaStudentId: string;
      firstName: string;
      middleName: string | null;
      lastName: string;
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
        requiresStaffAuthorization =
          true;
        reasonCode =
          "EARLY_DEPARTURE_AUTH_REQUIRED";
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

  const student =
    card &&
    cardResult === "MATCHED"
      ? {
          id:
            card.studentId,
          casaStudentId:
            card.casaStudentId,
          firstName:
            card.firstName,
          middleName:
            card.middleName,
          lastName:
            card.lastName,
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