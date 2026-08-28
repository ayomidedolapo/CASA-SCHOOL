import {
  randomBytes,
  randomUUID,
} from "node:crypto";

import {
  createBiometricAssertion,
  verifyBiometricAssertion,
} from "../src/server/attendance/biometric-assertion";

const secret =
  randomBytes(32).toString(
    "base64url",
  );

const now =
  new Date();

const payload = {
  version: 1 as const,
  assertionId:
    randomBytes(18).toString(
      "base64url",
    ),
  attemptId:
    randomUUID(),
  studentId:
    randomUUID(),
  profileId:
    randomUUID(),
  provider:
    "selftest",
  providerVerificationId:
    `verify-${randomUUID()}`,
  faceResult:
    "PASSED" as const,
  livenessResult:
    "PASSED" as const,
  faceConfidenceBps: 9234,
  livenessConfidenceBps: 9788,
  issuedAt:
    now.toISOString(),
  expiresAt:
    new Date(
      now.getTime() + 60_000,
    ).toISOString(),
};

const token =
  createBiometricAssertion(
    payload,
    secret,
  );

const verified =
  verifyBiometricAssertion(
    token,
    secret,
    new Date(
      now.getTime() + 1_000,
    ),
  );

if (
  verified.attemptId !==
    payload.attemptId ||
  verified.studentId !==
    payload.studentId ||
  verified.profileId !==
    payload.profileId ||
  verified.faceConfidenceBps !==
    payload.faceConfidenceBps ||
  verified.livenessConfidenceBps !==
    payload.livenessConfidenceBps
) {
  throw new Error(
    "Biometric assertion round-trip failed.",
  );
}

const parts =
  token.split(".");

const tampered =
  [
    parts[0],
    parts[1],
    (
      parts[2]?.endsWith("A")
        ? `${parts[2].slice(0, -1)}B`
        : `${parts[2]?.slice(0, -1)}A`
    ),
  ].join(".");

let tamperRejected = false;

try {
  verifyBiometricAssertion(
    tampered,
    secret,
    new Date(
      now.getTime() + 1_000,
    ),
  );
} catch {
  tamperRejected = true;
}

if (!tamperRejected) {
  throw new Error(
    "Tampered biometric assertion was accepted.",
  );
}

let expiredRejected = false;

try {
  verifyBiometricAssertion(
    token,
    secret,
    new Date(
      now.getTime() + 180_000,
    ),
  );
} catch {
  expiredRejected = true;
}

if (!expiredRejected) {
  throw new Error(
    "Expired biometric assertion was accepted.",
  );
}

console.log(
  "CASA School trusted biometric assertion self-test passed.",
);