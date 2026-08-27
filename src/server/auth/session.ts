import {
  and,
  eq,
  gt,
  isNull,
} from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/db";
import {
  authSessions,
  users,
} from "@/db/schema";

import {
  createSessionToken,
  hashSessionToken,
} from "./token";

const SESSION_MAX_AGE_SECONDS =
  7 * 24 * 60 * 60;

function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Host-casa_school_session"
    : "casa_school_session";
}

export interface CurrentAuthSession {
  sessionId: string;
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  expiresAt: Date;
}

export async function createAuthSession(
  userId: string,
): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const db = getDb();
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(
    Date.now() +
      SESSION_MAX_AGE_SECONDS * 1000,
  );

  await db.insert(authSessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return {
    token,
    expiresAt,
  };
}

export async function setAuthSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(
    getSessionCookieName(),
    token,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      priority: "high",
    },
  );
}

export async function clearAuthSessionCookie(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(
    getSessionCookieName(),
    "",
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV ===
        "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
      priority: "high",
    },
  );
}

export async function getCurrentAuthSession(): Promise<
  CurrentAuthSession | null
> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(
      getSessionCookieName(),
    )?.value;

  if (!token) {
    return null;
  }

  const tokenHash =
    hashSessionToken(token);
  const db = getDb();

  const rows = await db
    .select({
      sessionId: authSessions.id,
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      expiresAt: authSessions.expiresAt,
    })
    .from(authSessions)
    .innerJoin(
      users,
      eq(
        authSessions.userId,
        users.id,
      ),
    )
    .where(
      and(
        eq(
          authSessions.tokenHash,
          tokenHash,
        ),
        isNull(
          authSessions.revokedAt,
        ),
        gt(
          authSessions.expiresAt,
          new Date(),
        ),
        eq(
          users.status,
          "ACTIVE",
        ),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function revokeCurrentAuthSession(): Promise<void> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(
      getSessionCookieName(),
    )?.value;

  if (token) {
    const db = getDb();

    await db
      .update(authSessions)
      .set({
        revokedAt: new Date(),
      })
      .where(
        and(
          eq(
            authSessions.tokenHash,
            hashSessionToken(token),
          ),
          isNull(
            authSessions.revokedAt,
          ),
        ),
      );
  }

  await clearAuthSessionCookie();
}

export async function revokeAllAuthSessionsForUser(
  userId: string,
): Promise<void> {
  const db = getDb();

  await db
    .update(authSessions)
    .set({
      revokedAt: new Date(),
    })
    .where(
      and(
        eq(
          authSessions.userId,
          userId,
        ),
        isNull(
          authSessions.revokedAt,
        ),
      ),
    );
}