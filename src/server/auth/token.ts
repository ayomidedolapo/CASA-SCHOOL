import {
  createHash,
  randomBytes,
} from "node:crypto";

const SESSION_TOKEN_BYTES = 32;

export function createSessionToken(): string {
  return randomBytes(
    SESSION_TOKEN_BYTES,
  ).toString("base64url");
}

export function hashSessionToken(
  token: string,
): string {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}