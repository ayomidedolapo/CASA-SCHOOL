import {
  createHash,
  randomBytes,
} from "node:crypto";

export const STUDENT_CARD_QR_PREFIX =
  "CASA1.";

export interface StudentCardCredential {
  token: string;
  tokenHash: string;
  serialNumber: string;
  payload: string;
}

export function hashStudentCardToken(
  token: string,
): string {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

export function createStudentCardCredential():
  StudentCardCredential {
  const token =
    randomBytes(32).toString(
      "base64url",
    );

  const tokenHash =
    hashStudentCardToken(token);

  const serialNumber =
    `CS-${randomBytes(8)
      .toString("hex")
      .toUpperCase()}`;

  return {
    token,
    tokenHash,
    serialNumber,
    payload:
      `${STUDENT_CARD_QR_PREFIX}${token}`,
  };
}