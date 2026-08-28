import {
  STUDENT_CARD_QR_PREFIX,
  createStudentCardCredential,
  hashStudentCardToken,
} from "../src/server/identity/student-card";

const first =
  createStudentCardCredential();
const second =
  createStudentCardCredential();

if (
  first.token === second.token ||
  first.tokenHash === second.tokenHash ||
  first.serialNumber ===
    second.serialNumber
) {
  throw new Error(
    "Student card credential generator repeated a supposedly random value.",
  );
}

if (
  !/^[A-Za-z0-9_-]{43}$/.test(
    first.token,
  )
) {
  throw new Error(
    "Student card token is not a 256-bit base64url value.",
  );
}

if (
  !/^[0-9a-f]{64}$/.test(
    first.tokenHash,
  )
) {
  throw new Error(
    "Student card token hash is not SHA-256 hex.",
  );
}

if (
  hashStudentCardToken(
    first.token,
  ) !== first.tokenHash
) {
  throw new Error(
    "Student card token hash is not reproducible.",
  );
}

if (
  first.payload !==
  `${STUDENT_CARD_QR_PREFIX}${first.token}`
) {
  throw new Error(
    "Student card QR payload format is invalid.",
  );
}

if (
  first.tokenHash.includes(
    first.token,
  )
) {
  throw new Error(
    "Token hash unexpectedly contains the raw token.",
  );
}

console.log(
  "CASA School student-card cryptographic self-test passed.",
);