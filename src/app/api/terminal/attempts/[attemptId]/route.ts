import {
  and,
  eq,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  attendanceEarlyDepartureAuthorizations,
  attendanceVerificationAttempts,
} from "@/db/schema";
import {
  attendanceNoStoreHeaders,
  terminalUnauthorizedResponse,
} from "@/server/attendance/http";
import {
  authenticateTerminalRequest,
} from "@/server/attendance/terminal-auth";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    attemptId: string;
  }>;
}

export async function GET(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const access =
    await authenticateTerminalRequest(
      request,
    );

  if (!access) {
    return terminalUnauthorizedResponse();
  }

  const {
    attemptId,
  } =
    await context.params;

  if (
    !z.string()
      .uuid()
      .safeParse(
        attemptId,
      ).success
  ) {
    return NextResponse.json(
      {
        message:
          "Invalid verification attempt.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const db = getDb();

  const rows =
    await db
      .select({
        id:
          attendanceVerificationAttempts.id,
        operation:
          attendanceVerificationAttempts.operation,
        outcome:
          attendanceVerificationAttempts.outcome,
        reasonCode:
          attendanceVerificationAttempts.reasonCode,
        departureResult:
          attendanceVerificationAttempts.departureResult,
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
            attendanceVerificationAttempts.id,
            attemptId,
          ),
        ),
      )
      .limit(1);

  const attempt =
    rows[0];

  if (!attempt) {
    return NextResponse.json(
      {
        message:
          "Verification attempt not found.",
      },
      {
        status: 404,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const authorizationRows =
    attempt.operation ===
      "CHECK_OUT"
      ? await db
          .select({
            id:
              attendanceEarlyDepartureAuthorizations.id,
          })
          .from(
            attendanceEarlyDepartureAuthorizations,
          )
          .where(
            and(
              eq(
                attendanceEarlyDepartureAuthorizations.schoolId,
                access.school.id,
              ),
              eq(
                attendanceEarlyDepartureAuthorizations.attemptId,
                attempt.id,
              ),
            ),
          )
          .limit(1)
      : [];

  const earlyAuthorized =
    Boolean(
      authorizationRows[0],
    ) &&
    attempt.departureResult ===
      "EARLY" &&
    attempt.reasonCode ===
      null;

  return NextResponse.json(
    {
      attempt,
      requiresStaffAuthorization:
        attempt.reasonCode ===
        "EARLY_DEPARTURE_AUTH_REQUIRED",
      staffAuthorized:
        earlyAuthorized,
      requiresBiometric:
        attempt.outcome ===
          "PENDING" &&
        (
          attempt.operation ===
            "CHECK_IN" ||
          attempt.departureResult ===
            "NORMAL" ||
          earlyAuthorized
        ),
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}