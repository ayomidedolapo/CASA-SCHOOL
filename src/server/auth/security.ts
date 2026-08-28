import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { NextRequest } from "next/server";

import { getDb } from "@/db";
import { authLoginEvents } from "@/db/schema";

const HASH_PATTERN = /^[0-9a-f]{64}$/;

function getSecuritySecret(): string {
  const secret =
    process.env.AUTH_SECURITY_HMAC_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECURITY_HMAC_SECRET must contain at least 32 characters.",
    );
  }

  return secret;
}

export function securityFingerprint(
  namespace: string,
  value: string,
): string {
  return createHmac(
    "sha256",
    getSecuritySecret(),
  )
    .update(namespace, "utf8")
    .update("\0", "utf8")
    .update(value, "utf8")
    .digest("hex");
}

export function constantTimeHashEqual(
  left: string,
  right: string,
): boolean {
  if (
    !HASH_PATTERN.test(left) ||
    !HASH_PATTERN.test(right)
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(left, "hex"),
    Buffer.from(right, "hex"),
  );
}

export function getTrustedSourceAddress(
  request: NextRequest,
): string | null {
  if (
    process.env.CASA_TRUST_PROXY_HEADERS !==
    "true"
  ) {
    return null;
  }

  const configuredHeader =
    process.env.CASA_PROXY_IP_HEADER?.trim()
      .toLowerCase();

  const allowedHeaders = new Set([
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
  ]);

  if (
    !configuredHeader ||
    !allowedHeaders.has(configuredHeader)
  ) {
    return null;
  }

  const raw =
    request.headers.get(
      configuredHeader,
    );

  if (!raw) {
    return null;
  }

  const first =
    raw.split(",")[0]?.trim();

  if (
    !first ||
    first.length > 64 ||
    /[\r\n]/.test(first)
  ) {
    return null;
  }

  return first;
}

export type AuthSecurityEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGIN_RATE_LIMITED"
  | "PASSKEY_LOGIN_SUCCESS"
  | "PASSKEY_LOGIN_FAILURE"
  | "PASSKEY_REGISTERED"
  | "PASSKEY_STEP_UP_SUCCESS"
  | "PASSKEY_STEP_UP_FAILURE"
  | "LOGOUT"
  | "FIRST_OWNER_PROVISIONED";

export async function recordAuthSecurityEvent(input: {
  eventType: AuthSecurityEventType;
  identifierHash: string;
  userId?: string | null;
  reason?: string | null;
  sourceAddressHash?: string | null;
}): Promise<void> {
  try {
    const db = getDb();

    await db.insert(authLoginEvents).values({
      eventType: input.eventType,
      identifierHash:
        input.identifierHash,
      userId: input.userId ?? null,
      reason: input.reason ?? null,
      sourceAddressHash:
        input.sourceAddressHash ??
        null,
    });
  } catch {
    // Security logging must not leak details or turn a
    // secondary logging failure into an auth information leak.
  }
}