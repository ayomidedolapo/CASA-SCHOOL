import {
  and,
  eq,
  sql,
} from "drizzle-orm";

import { getDb } from "@/db";
import { authRateLimits } from "@/db/schema";

const SCOPE = "LOGIN_IDENTIFIER";
const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export interface LoginRateLimitState {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function checkLoginRateLimit(
  keyHash: string,
): Promise<LoginRateLimitState> {
  const db = getDb();
  const now = new Date();

  const rows = await db
    .select({
      blockedUntil:
        authRateLimits.blockedUntil,
      windowStartedAt:
        authRateLimits.windowStartedAt,
      failureCount:
        authRateLimits.failureCount,
    })
    .from(authRateLimits)
    .where(
      and(
        eq(
          authRateLimits.scope,
          SCOPE,
        ),
        eq(
          authRateLimits.keyHash,
          keyHash,
        ),
      ),
    )
    .limit(1);

  const state = rows[0];

  if (!state) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }

  if (
    state.blockedUntil &&
    state.blockedUntil > now
  ) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (state.blockedUntil.getTime() -
            now.getTime()) /
            1000,
        ),
      ),
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

export async function recordLoginFailure(
  keyHash: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const windowBoundary = new Date(
    now.getTime() - WINDOW_MS,
  );
  const blockedUntil = new Date(
    now.getTime() + BLOCK_MS,
  );

  await db
    .insert(authRateLimits)
    .values({
      scope: SCOPE,
      keyHash,
      windowStartedAt: now,
      failureCount: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        authRateLimits.scope,
        authRateLimits.keyHash,
      ],
      set: {
        failureCount: sql`
          case
            when ${authRateLimits.windowStartedAt} < ${windowBoundary}
              then 1
            else ${authRateLimits.failureCount} + 1
          end
        `,
        windowStartedAt: sql`
          case
            when ${authRateLimits.windowStartedAt} < ${windowBoundary}
              then ${now}
            else ${authRateLimits.windowStartedAt}
          end
        `,
        blockedUntil: sql`
          case
            when (
              case
                when ${authRateLimits.windowStartedAt} < ${windowBoundary}
                  then 1
                else ${authRateLimits.failureCount} + 1
              end
            ) >= ${MAX_FAILURES}
              then ${blockedUntil}
            else null
          end
        `,
        updatedAt: now,
      },
    });
}

export async function clearLoginFailures(
  keyHash: string,
): Promise<void> {
  const db = getDb();

  await db
    .delete(authRateLimits)
    .where(
      and(
        eq(
          authRateLimits.scope,
          SCOPE,
        ),
        eq(
          authRateLimits.keyHash,
          keyHash,
        ),
      ),
    );
}