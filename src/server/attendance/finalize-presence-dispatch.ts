import {
  and,
  eq,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  attendanceVerificationAttempts,
} from "@/db/schema";

import type {
  BiometricAssertionPayload,
} from "./biometric-assertion";
import {
  finalizeAuthorizedEarlyDeparture,
} from "./finalize-early-departure";
import {
  finalizeVerifiedPresence as finalizeStandardVerifiedPresence,
  type FinalizePresenceResult,
} from "./finalize-presence";
import type {
  TerminalAccess,
} from "./terminal-auth";
import {
  consumeLateStayAuthorizationForAttempt,
} from "./branch-session";

export async function finalizeVerifiedPresence(
  access:
    TerminalAccess,
  attemptId:
    string,
  assertion:
    BiometricAssertionPayload,
): Promise<FinalizePresenceResult> {
  const db = getDb();

  const rows =
    await db
      .select({
        outcome:
          attendanceVerificationAttempts.outcome,
        operation:
          attendanceVerificationAttempts.operation,
        departureResult:
          attendanceVerificationAttempts.departureResult,
        reasonCode:
          attendanceVerificationAttempts.reasonCode,
        manualVerifiedByMembershipId:
          attendanceVerificationAttempts.manualVerifiedByMembershipId,
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

  if (
    attempt?.outcome ===
      "PENDING" &&
    attempt.operation ===
      "CHECK_OUT" &&
    attempt.departureResult ===
      "EARLY" &&
    attempt.reasonCode ===
      null &&
    attempt.manualVerifiedByMembershipId
  ) {
    return finalizeAuthorizedEarlyDeparture(
      access,
      attemptId,
      assertion,
    );
  }

  const result = await finalizeStandardVerifiedPresence(
    access,
    attemptId,
    assertion,
  );

  if (result.ok && result.operation === "CHECK_OUT") {
    await consumeLateStayAuthorizationForAttempt({
      schoolId: access.school.id,
      attemptId,
    });
  }

  return result;
}