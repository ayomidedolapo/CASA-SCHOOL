import {
  and,
  eq,
} from "drizzle-orm";
import {
  randomBytes,
} from "node:crypto";

import { getDb } from "@/db";
import {
  attendanceVerificationAttempts,
  studentBiometricProfiles,
} from "@/db/schema";
import {
  createBiometricAssertion,
} from "@/server/attendance/biometric-assertion";
import {
  emitCasaOperationalNotificationBestEffort,
} from "@/server/internal/operational-notifications";
import {
  finalizeVerifiedPresence,
} from "@/server/attendance/finalize-presence-dispatch";
import type {
  TerminalAccess,
} from "@/server/attendance/terminal-auth";

import {
  evaluateBiometricVerification,
  getBiometricThresholdPolicy,
} from "./policy";
import {
  verifyBiometricSubject,
} from "./provider";

export async function verifyAndFinalizeBiometricPresence(
  input: {
    access:
      TerminalAccess;
    attemptId: string;
    capture: File;
  },
) {
  const db = getDb();

  const attemptRows =
    await db
      .select({
        id:
          attendanceVerificationAttempts.id,
        studentId:
          attendanceVerificationAttempts.studentId,
        outcome:
          attendanceVerificationAttempts.outcome,
        operation:
          attendanceVerificationAttempts.operation,
      })
      .from(
        attendanceVerificationAttempts,
      )
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            input.access.school.id,
          ),
          eq(
            attendanceVerificationAttempts.terminalId,
            input.access.terminal.id,
          ),
          eq(
            attendanceVerificationAttempts.id,
            input.attemptId,
          ),
        ),
      )
      .limit(1);

  const attempt =
    attemptRows[0];

  if (
    !attempt ||
    !attempt.studentId
  ) {
    return {
      ok: false as const,
      status: 404 as const,
      code:
        "ATTEMPT_NOT_FOUND",
    };
  }

  if (
    attempt.outcome ===
      "RECORDED"
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTEMPT_ALREADY_RECORDED",
    };
  }

  if (
    attempt.outcome !==
      "PENDING"
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ATTEMPT_NOT_FINALIZABLE",
    };
  }

  const profileRows =
    await db
      .select({
        id:
          studentBiometricProfiles.id,
        provider:
          studentBiometricProfiles.provider,
        providerSubjectRef:
          studentBiometricProfiles.providerSubjectRef,
      })
      .from(
        studentBiometricProfiles,
      )
      .where(
        and(
          eq(
            studentBiometricProfiles.schoolId,
            input.access.school.id,
          ),
          eq(
            studentBiometricProfiles.studentId,
            attempt.studentId,
          ),
          eq(
            studentBiometricProfiles.status,
            "ACTIVE",
          ),
        ),
      )
      .limit(1);

  const profile =
    profileRows[0];

  if (!profile) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ACTIVE_BIOMETRIC_PROFILE_REQUIRED",
    };
  }

  let provider:
    Awaited<
      ReturnType<
        typeof verifyBiometricSubject
      >
    >;

  try {
    provider =
      await verifyBiometricSubject({
        schoolId:
          input.access.school.id,
        studentId:
          attempt.studentId,
        attemptId:
          attempt.id,
        subjectRef:
          profile.providerSubjectRef,
        capture:
          input.capture,
      });
  } catch (error) {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "BIOMETRIC_PROVIDER_FAILURE",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          input.access.school.id,
      },
      title:
        "Biometric verification provider failed",
      body:
        "CASA could not complete a scanner biometric provider request.",
      actionUrl:
        "/internal/health",
      dedupKey:
        `biometric-verification-provider:${input.access.school.id}`,
      payload: {
        studentId:
          attempt.studentId,
        attemptId:
          attempt.id,
        terminalId:
          input.access.terminal.id,
        errorName:
          error instanceof Error
            ? error.name
            : "UnknownError",
      },
    });

    throw error;
  }

  if (
    provider.provider !==
      profile.provider
  ) {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "BIOMETRIC_PROVIDER_PROFILE_MISMATCH",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          input.access.school.id,
      },
      title:
        "Biometric provider/profile mismatch",
      body:
        "A scanner verification response came from a different biometric provider than the student's active profile.",
      actionUrl:
        "/internal/health",
      dedupKey:
        `biometric-provider-mismatch:${input.access.school.id}:${profile.id}`,
      payload: {
        studentId:
          attempt.studentId,
        attemptId:
          attempt.id,
        terminalId:
          input.access.terminal.id,
        profileProvider:
          profile.provider,
        responseProvider:
          provider.provider,
      },
    });

    return {
      ok: false as const,
      status: 502 as const,
      code:
        "BIOMETRIC_PROVIDER_PROFILE_MISMATCH",
    };
  }

  const policy =
    getBiometricThresholdPolicy();

  const decision =
    evaluateBiometricVerification(
      {
        facePassed:
          provider.face.passed,
        faceConfidenceBps:
          provider.face
            .confidenceBps,
        livenessPassed:
          provider.liveness
            .passed,
        livenessConfidenceBps:
          provider.liveness
            .confidenceBps,
      },
      policy,
    );

  if (!decision.accepted) {
    const faceResult =
      provider.face.passed
        ? "PASSED"
        : "FAILED";

    const livenessResult =
      provider.liveness.passed
        ? "PASSED"
        : "FAILED";

    await db
      .update(
        attendanceVerificationAttempts,
      )
      .set({
        faceResult,
        faceConfidenceBps:
          provider.face
            .confidenceBps,
        livenessResult,
        livenessConfidenceBps:
          provider.liveness
            .confidenceBps,
        outcome:
          "REJECTED",
        reasonCode:
          decision.reason,
        completedAt:
          new Date(),
      })
      .where(
        and(
          eq(
            attendanceVerificationAttempts.schoolId,
            input.access.school.id,
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

    return {
      ok: false as const,
      status: 422 as const,
      code:
        decision.reason ??
        "BIOMETRIC_VERIFICATION_FAILED",
      scores: {
        faceConfidenceBps:
          provider.face
            .confidenceBps,
        livenessConfidenceBps:
          provider.liveness
            .confidenceBps,
      },
    };
  }

  const secret =
    process.env
      .CASA_BIOMETRIC_ASSERTION_HMAC_SECRET;

  if (!secret) {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "BIOMETRIC_CONFIGURATION_FAILURE",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          input.access.school.id,
      },
      title:
        "Biometric assertion secret is missing",
      body:
        "CASA cannot finalize verified attendance because the biometric assertion configuration is unavailable.",
      actionUrl:
        "/internal/health",
      dedupKey:
        "biometric-assertion-secret:missing",
      payload: {
        terminalId:
          input.access.terminal.id,
      },
    });

    return {
      ok: false as const,
      status: 503 as const,
      code:
        "BIOMETRIC_ASSERTION_NOT_CONFIGURED",
    };
  }

  const now =
    new Date();

  const assertionToken =
    createBiometricAssertion(
      {
        version: 1,
        assertionId:
          randomBytes(18)
            .toString(
              "base64url",
            ),
        attemptId:
          attempt.id,
        studentId:
          attempt.studentId,
        profileId:
          profile.id,
        provider:
          provider.provider,
        providerVerificationId:
          provider.verificationId,
        faceResult:
          "PASSED",
        livenessResult:
          "PASSED",
        faceConfidenceBps:
          provider.face
            .confidenceBps,
        livenessConfidenceBps:
          provider.liveness
            .confidenceBps,
        issuedAt:
          now.toISOString(),
        expiresAt:
          new Date(
            now.getTime() +
              60_000,
          ).toISOString(),
      },
      secret,
    );

  const {
    verifyBiometricAssertion,
  } =
    await import(
      "@/server/attendance/biometric-assertion"
    );

  const assertion =
    verifyBiometricAssertion(
      assertionToken,
      secret,
      now,
    );

  const finalized =
    await finalizeVerifiedPresence(
      input.access,
      attempt.id,
      assertion,
    );

  if (!finalized.ok) {
    return {
      ok: false as const,
      status:
        finalized.status,
      code:
        finalized.code,
    };
  }

  return {
    ok: true as const,
    presence: {
      operation:
        finalized.operation,
      attendanceRecordId:
        finalized
          .attendanceRecordId,
      presenceEventId:
        finalized
          .presenceEventId,
      notificationQueued:
        finalized
          .notificationQueued,
      replayed:
        finalized.replayed,
    },
    scores: {
      faceConfidenceBps:
        provider.face
          .confidenceBps,
      livenessConfidenceBps:
        provider.liveness
          .confidenceBps,
    },
  };
}