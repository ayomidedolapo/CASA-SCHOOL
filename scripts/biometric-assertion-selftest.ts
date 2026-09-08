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

const signature =
  parts[2] ?? "";

const base64UrlAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const finalCharacter =
  signature.slice(-1);

const finalIndex =
  base64UrlAlphabet.indexOf(
    finalCharacter,
  );

if (
  signature.length !== 43 ||
  finalIndex < 0 ||
  finalIndex % 4 !== 0 ||
  finalIndex + 1 >=
    base64UrlAlphabet.length
) {
  throw new Error(
    "Biometric assertion signature was not canonical Base64URL.",
  );
}

const nonCanonicalAlias =
  `${signature.slice(
    0,
    -1,
  )}${base64UrlAlphabet[
    finalIndex + 1
  ]}`;

if (
  !Buffer.from(
    signature,
    "base64url",
  ).equals(
    Buffer.from(
      nonCanonicalAlias,
      "base64url",
    ),
  )
) {
  throw new Error(
    "Self-test could not construct an equivalent non-canonical signature alias.",
  );
}

const tampered =
  [
    parts[0],
    parts[1],
    nonCanonicalAlias,
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
    "Non-canonical biometric assertion signature alias was accepted.",
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