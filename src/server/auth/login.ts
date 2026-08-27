import {
  eq,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  authPasswordCredentials,
  users,
} from "@/db/schema";

import {
  hashPassword,
  verifyPassword,
} from "./password";
import {
  normalizeLoginIdentifier,
} from "./identifier";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "./rate-limit";
import {
  recordAuthSecurityEvent,
  securityFingerprint,
} from "./security";
import {
  createAuthSession,
  setAuthSessionCookie,
} from "./session";

const dummyPasswordHashPromise =
  hashPassword(
    "CASA School Dummy Credential 2026!",
  );

export type LoginResult =
  | {
      ok: true;
      user: {
        id: string;
        fullName: string;
        email: string | null;
        phone: string | null;
      };
      expiresAt: Date;
    }
  | {
      ok: false;
      status: 400 | 401 | 429;
      retryAfterSeconds?: number;
    };

export async function loginWithPassword(input: {
  identifier: string;
  password: string;
  sourceAddress?: string | null;
}): Promise<LoginResult> {
  const normalized =
    normalizeLoginIdentifier(
      input.identifier,
    );

  if (!normalized) {
    return {
      ok: false,
      status: 400,
    };
  }

  const identifierHash =
    securityFingerprint(
      "login-identifier",
      `${normalized.kind}:${normalized.value}`,
    );

  const sourceAddressHash =
    input.sourceAddress
      ? securityFingerprint(
          "source-address",
          input.sourceAddress,
        )
      : null;

  const rateState =
    await checkLoginRateLimit(
      identifierHash,
    );

  if (!rateState.allowed) {
    await recordAuthSecurityEvent({
      eventType:
        "LOGIN_RATE_LIMITED",
      identifierHash,
      sourceAddressHash,
      reason:
        "IDENTIFIER_RATE_LIMIT",
    });

    return {
      ok: false,
      status: 429,
      retryAfterSeconds:
        rateState.retryAfterSeconds,
    };
  }

  const db = getDb();

  const whereIdentity =
    normalized.kind === "EMAIL"
      ? eq(
          users.email,
          normalized.value,
        )
      : eq(
          users.phone,
          normalized.value,
        );

  const rows = await db
    .select({
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      userStatus: users.status,
      passwordHash:
        authPasswordCredentials.passwordHash,
      mustChangePassword:
        authPasswordCredentials.mustChangePassword,
    })
    .from(users)
    .leftJoin(
      authPasswordCredentials,
      eq(
        authPasswordCredentials.userId,
        users.id,
      ),
    )
    .where(whereIdentity)
    .limit(1);

  const candidate = rows[0];

  const passwordHash =
    candidate?.passwordHash ??
    (await dummyPasswordHashPromise);

  const passwordValid =
    await verifyPassword(
      passwordHash,
      input.password,
    );

  const loginAllowed =
    Boolean(candidate) &&
    candidate?.userStatus ===
      "ACTIVE" &&
    Boolean(
      candidate?.passwordHash,
    ) &&
    passwordValid;

  if (!loginAllowed || !candidate) {
    await recordLoginFailure(
      identifierHash,
    );

    await recordAuthSecurityEvent({
      eventType: "LOGIN_FAILURE",
      identifierHash,
      sourceAddressHash,
      userId:
        candidate?.userId ?? null,
      reason: "INVALID_CREDENTIALS",
    });

    return {
      ok: false,
      status: 401,
    };
  }

  await clearLoginFailures(
    identifierHash,
  );

  const session =
    await createAuthSession(
      candidate.userId,
    );

  await setAuthSessionCookie(
    session.token,
    session.expiresAt,
  );

  await recordAuthSecurityEvent({
    eventType: "LOGIN_SUCCESS",
    identifierHash,
    sourceAddressHash,
    userId: candidate.userId,
  });

  return {
    ok: true,
    user: {
      id: candidate.userId,
      fullName:
        candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
    },
    expiresAt:
      session.expiresAt,
  };
}