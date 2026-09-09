import {
  and,
  desc,
  eq,
  notExists,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  attendanceVerificationAttempts,
  studentAttendanceRecords,
} from "@/db/schema";
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

  const db = getDb();
  const rows =
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
        completedAt:
          attendanceVerificationAttempts.completedAt,
        createdAt:
          attendanceVerificationAttempts.createdAt,
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
            attendanceVerificationAttempts.sessionId,
            active.session.id,
          ),
          eq(
            attendanceVerificationAttempts.operation,
            "CHECK_IN",
          ),
          eq(
            attendanceVerificationAttempts.cardResult,
            "MATCHED",
          ),
          eq(
            attendanceVerificationAttempts.outcome,
            "PENDING",
          ),
          notExists(
            db
              .select({
                id:
                  studentAttendanceRecords.id,
              })
              .from(
                studentAttendanceRecords,
              )
              .where(
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
              ),
          ),
        ),
      )
      .orderBy(
        desc(
          attendanceVerificationAttempts.createdAt,
        ),
      )
      .limit(10);

  const latest = rows[0];

  return NextResponse.json(
    {
      pending:
        latest
          ? {
              attempt: {
                id:
                  latest.id,
                operation:
                  latest.operation,
                cardResult:
                  latest.cardResult,
                timeResult:
                  latest.timeResult,
                departureResult:
                  latest.departureResult,
                outcome:
                  latest.outcome,
                reasonCode:
                  latest.reasonCode,
                completedAt:
                  latest.completedAt,
              },
              student:
                null,
              replayed:
                true,
              requiresBiometric:
                true,
              requiresStaffAuthorization:
                false,
              classification:
                null,
            }
          : null,
      duplicatePendingCount:
        rows.length,
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}
