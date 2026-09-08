import {
  and,
  eq,
  gt,
  isNull,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  authWebauthnChallenges,
} from "@/db/schema";

const CHALLENGE_LIFETIME_MS =
  5 * 60 * 1000;

export type PasskeyChallengePurpose =
  | "REGISTRATION"
  | "LOGIN"
  | "STEP_UP";

export async function savePasskeyChallenge(
  input: {
    purpose:
      PasskeyChallengePurpose;
    challenge: string;
    userId?: string | null;
    schoolId?: string | null;
    membershipId?: string | null;
    internalMembershipId?:
      string | null;
    webauthnUserId?:
      string | null;
    action?: string | null;
  },
): Promise<{
  ceremonyId: string;
  expiresAt: Date;
}> {
  const db = getDb();

  const expiresAt =
    new Date(
      Date.now() +
        CHALLENGE_LIFETIME_MS,
    );

  const rows =
    await db
      .insert(
        authWebauthnChallenges,
      )
      .values({
        purpose:
          input.purpose,
        challenge:
          input.challenge,
        userId:
          input.userId ?? null,
        schoolId:
          input.schoolId ?? null,
        membershipId:
          input.membershipId ??
          null,
        internalMembershipId:
          input.internalMembershipId ??
          null,
        webauthnUserId:
          input.webauthnUserId ??
          null,
        action:
          input.action ?? null,
        expiresAt,
      })
      .returning({
        id:
          authWebauthnChallenges.id,
      });

  if (!rows[0]) {
    throw new Error(
      "Unable to create WebAuthn challenge.",
    );
  }

  return {
    ceremonyId:
      rows[0].id,
    expiresAt,
  };
}

export async function getUsablePasskeyChallenge(
  ceremonyId: string,
  purpose:
    PasskeyChallengePurpose,
) {
  const db = getDb();

  const rows =
    await db
      .select()
      .from(
        authWebauthnChallenges,
      )
      .where(
        and(
          eq(
            authWebauthnChallenges.id,
            ceremonyId,
          ),
          eq(
            authWebauthnChallenges.purpose,
            purpose,
          ),
          isNull(
            authWebauthnChallenges.usedAt,
          ),
          gt(
            authWebauthnChallenges.expiresAt,
            new Date(),
          ),
        ),
      )
      .limit(1);

  return rows[0] ?? null;
}