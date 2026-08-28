import {
  createRotatedTerminalSecret,
  createTerminalCredential,
  hashTerminalSecret,
  parseTerminalToken,
  terminalSecretMatches,
} from "../src/server/attendance/terminal-credential";
import {
  parseStudentCardPayload,
} from "../src/server/attendance/scan";
import {
  createStudentCardCredential,
} from "../src/server/identity/student-card";

const first =
  createTerminalCredential();

const parsed =
  parseTerminalToken(
    first.token,
  );

if (
  !parsed ||
  parsed.terminalId !==
    first.terminalId ||
  parsed.secret !== first.secret
) {
  throw new Error(
    "Terminal token parse failed.",
  );
}

if (
  hashTerminalSecret(
    first.secret,
  ) !== first.secretHash
) {
  throw new Error(
    "Terminal secret hash mismatch.",
  );
}

if (
  !terminalSecretMatches(
    first.secret,
    first.secretHash,
  )
) {
  throw new Error(
    "Terminal secret verification failed.",
  );
}

if (
  terminalSecretMatches(
    "invalid-secret",
    first.secretHash,
  )
) {
  throw new Error(
    "Invalid terminal secret matched.",
  );
}

const rotated =
  createRotatedTerminalSecret(
    first.terminalId,
  );

if (
  rotated.secretHash ===
    first.secretHash ||
  rotated.token ===
    first.token
) {
  throw new Error(
    "Terminal credential rotation did not rotate.",
  );
}

const card =
  createStudentCardCredential();

const resolvedCard =
  parseStudentCardPayload(
    card.payload,
  );

if (
  !resolvedCard ||
  resolvedCard.tokenHash !==
    card.tokenHash
) {
  throw new Error(
    "Student QR resolution failed.",
  );
}

if (
  parseStudentCardPayload(
    `WRONG.${card.token}`,
  ) !== null
) {
  throw new Error(
    "Invalid student QR prefix accepted.",
  );
}

console.log(
  "CASA School terminal credential and QR self-test passed.",
);