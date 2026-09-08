import {
  createHash,
  randomBytes,
} from "node:crypto";
import {
  and,
  eq,
  gt,
  isNull,
  sql,
} from "drizzle-orm";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";

import { getDb } from "@/db";
import {
  authPasskeys,
  authPasskeyStepUpGrants,
} from "@/db/schema";

import type {
  SchoolAccess,
} from "./authorization";
import {
  getUsablePasskeyChallenge,
  savePasskeyChallenge,
} from "./passkey-challenge";
import {
  getPasskeyRpConfig,
} from "./passkey-config";
import {
  parseStoredTransports,
  toWebAuthnCredential,
} from "./passkey-credential";
import {
  recordAuthSecurityEvent,
  securityFingerprint,
} from "./security";

export const PASSKEY_STEP_UP_ACTIONS = [
  "BIOMETRIC_ENROLL",
  "BIOMETRIC_REENROLL",
  "CARD_ISSUE",
  "CARD_REISSUE",
  "TERMINAL_PROVISION",
  "TERMINAL_ROTATE",
  "TERMINAL_SUSPEND",
  "TERMINAL_REACTIVATE",
  "TERMINAL_REVOKE",
  "ATTENDANCE_SESSION_POLICY_REBIND",
  "ATTENDANCE_SESSION_REOPEN",
  "EARLY_DEPARTURE",
  "PASSKEY_REVOKE",
  "ROLE_CHANGE",
  "SECURITY_SETTINGS",
] as const;

export type PasskeyStepUpAction =
  (typeof PASSKEY_STEP_UP_ACTIONS)[number];

type PasskeyStepUpActorScope =
  | "SCHOOL"
  | "CASA_INTERNAL";

interface PasskeyStepUpAccessLike {
  session: {
    userId: string;
  };
  school: {
    id: string;
  };
  membership: {
    id: string;
  };
}

const STEP_UP_GRANT_LIFETIME_MS =
  5 * 60 * 1000;

function hashGrantToken(
  token: string,
): string {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

export function createPasskeyStepUpGrantToken():
  string {
  return `CASASTEP1.${randomBytes(32).toString("base64url")}`;
}

export function isPasskeyStepUpAction(
  value: string,
): value is
  PasskeyStepUpAction {
  return (
    PASSKEY_STEP_UP_ACTIONS as
      readonly string[]
  ).includes(value);
}

export function hasPasskeyStepUpReturnedRow(
  result: unknown,
): boolean {
  if (Array.isArray(result)) {
    return result.length > 0;
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result
  ) {
    const rows =
      (
        result as {
          rows?: unknown;
        }
      ).rows;

    return (
      Array.isArray(rows) &&
      rows.length > 0
    );
  }

  return false;
}

function challengeMatchesActor(
  input: {
    scope:
      PasskeyStepUpActorScope;
    membershipId:
      string;
    challenge: {
      membershipId:
        string | null;
      internalMembershipId:
        string | null;
    };
  },
): boolean {
  if (
    input.scope ===
    "SCHOOL"
  ) {
    return (
      input.challenge
        .membershipId ===
        input.membershipId &&
      input.challenge
        .internalMembershipId ===
        null
    );
  }

  return (
    input.challenge
      .membershipId ===
      null &&
    input.challenge
      .internalMembershipId ===
      input.membershipId
  );
}

async function beginPasskeyStepUpForActor(
  access:
    PasskeyStepUpAccessLike,
  action:
    PasskeyStepUpAction,
  scope:
    PasskeyStepUpActorScope,
) {
  const db = getDb();

  const passkeys =
    await db
      .select({
        credentialId:
          authPasskeys.credentialId,
        transports:
          authPasskeys.transports,
      })
      .from(authPasskeys)
      .where(
        and(
          eq(
            authPasskeys.userId,
            access.session.userId,
          ),
          isNull(
            authPasskeys.revokedAt,
          ),
        ),
      );

  if (passkeys.length === 0) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "PASSKEY_REQUIRED",
    };
  }

  const config =
    getPasskeyRpConfig();

  const options =
    await generateAuthenticationOptions({
      rpID:
        config.rpID,
      userVerification:
        "required",
      allowCredentials:
        passkeys.map(
          (passkey) => ({
            id:
              passkey.credentialId,
            transports:
              parseStoredTransports(
                passkey.transports,
              ),
          }),
        ),
    });

  const ceremony =
    await savePasskeyChallenge({
      purpose:
        "STEP_UP",
      challenge:
        options.challenge,
      userId:
        access.session.userId,
      schoolId:
        access.school.id,
      membershipId:
        scope ===
        "SCHOOL"
          ? access.membership.id
          : null,
      internalMembershipId:
        scope ===
        "CASA_INTERNAL"
          ? access.membership.id
          : null,
      action,
    });

  return {
    ok: true as const,
    ceremonyId:
      ceremony.ceremonyId,
    expiresAt:
      ceremony.expiresAt,
    options,
  };
}

async function finishPasskeyStepUpForActor(
  input: {
    access:
      PasskeyStepUpAccessLike;
    action:
      PasskeyStepUpAction;
    ceremonyId: string;
    response:
      AuthenticationResponseJSON;
    scope:
      PasskeyStepUpActorScope;
  },
) {
  const challenge =
    await getUsablePasskeyChallenge(
      input.ceremonyId,
      "STEP_UP",
    );

  if (
    !challenge ||
    challenge.userId !==
      input.access.session.userId ||
    challenge.schoolId !==
      input.access.school.id ||
    !challengeMatchesActor({
      scope:
        input.scope,
      membershipId:
        input.access.membership.id,
      challenge: {
        membershipId:
          challenge.membershipId,
        internalMembershipId:
          challenge.internalMembershipId,
      },
    }) ||
    challenge.action !==
      input.action
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "PASSKEY_STEP_UP_CEREMONY_UNAVAILABLE",
    };
  }

  const db = getDb();

  const rows =
    await db
      .select({
        id:
          authPasskeys.id,
        credentialId:
          authPasskeys.credentialId,
        publicKeyBase64url:
          authPasskeys.publicKeyBase64url,
        counter:
          authPasskeys.counter,
        transports:
          authPasskeys.transports,
      })
      .from(authPasskeys)
      .where(
        and(
          eq(
            authPasskeys.userId,
            input.access.session.userId,
          ),
          eq(
            authPasskeys.credentialId,
            input.response.id,
          ),
          isNull(
            authPasskeys.revokedAt,
          ),
        ),
      )
      .limit(1);

  const passkey =
    rows[0];

  if (!passkey) {
    return {
      ok: false as const,
      status: 401 as const,
      code:
        "PASSKEY_STEP_UP_FAILED",
    };
  }

  const config =
    getPasskeyRpConfig();

  let verification;

  try {
    verification =
      await verifyAuthenticationResponse({
        response:
          input.response,
        expectedChallenge:
          challenge.challenge,
        expectedOrigin:
          config.expectedOrigins,
        expectedRPID:
          config.rpID,
        credential:
          toWebAuthnCredential(
            passkey,
          ),
        requireUserVerification:
          true,
      });
  } catch {
    await recordAuthSecurityEvent({
      eventType:
        "PASSKEY_STEP_UP_FAILURE",
      identifierHash:
        securityFingerprint(
          "passkey-step-up",
          `${input.access.session.userId}:${input.action}`,
        ),
      userId:
        input.access.session.userId,
      reason:
        input.action,
    });

    return {
      ok: false as const,
      status: 401 as const,
      code:
        "PASSKEY_STEP_UP_FAILED",
    };
  }

  if (!verification.verified) {
    return {
      ok: false as const,
      status: 401 as const,
      code:
        "PASSKEY_STEP_UP_FAILED",
    };
  }

  const grantToken =
    createPasskeyStepUpGrantToken();
  const grantTokenHash =
    hashGrantToken(
      grantToken,
    );
  const now =
    new Date();
  const expiresAt =
    new Date(
      now.getTime() +
        STEP_UP_GRANT_LIFETIME_MS,
    );
  const schoolMembershipId =
    input.scope ===
    "SCHOOL"
      ? input.access.membership.id
      : null;
  const internalMembershipId =
    input.scope ===
    "CASA_INTERNAL"
      ? input.access.membership.id
      : null;

  const result =
    await db.execute(sql`
      with consumed as (
        update auth_webauthn_challenges
        set
          used_at =
            ${now.toISOString()}::timestamptz
        where
          id =
            ${challenge.id}::uuid
          and user_id =
            ${input.access.session.userId}::uuid
          and school_id =
            ${input.access.school.id}::uuid
          and membership_id is not distinct from
            ${schoolMembershipId}::uuid
          and internal_membership_id is not distinct from
            ${internalMembershipId}::uuid
          and purpose =
            'STEP_UP'::auth_webauthn_challenge_purpose
          and action =
            ${input.action}
          and used_at is null
          and expires_at > now()
        returning
          id
      ),
      updated_passkey as (
        update auth_passkeys p
        set
          counter =
            ${verification.authenticationInfo.newCounter},
          last_used_at =
            ${now.toISOString()}::timestamptz,
          updated_at =
            ${now.toISOString()}::timestamptz
        from consumed
        where
          p.id =
            ${passkey.id}::uuid
          and p.revoked_at is null
        returning
          p.id
      )
      insert into auth_passkey_step_up_grants (
        user_id,
        school_id,
        membership_id,
        internal_membership_id,
        challenge_id,
        passkey_id,
        action,
        token_hash,
        expires_at,
        created_at
      )
      select
        ${input.access.session.userId}::uuid,
        ${input.access.school.id}::uuid,
        ${schoolMembershipId}::uuid,
        ${internalMembershipId}::uuid,
        consumed.id,
        updated_passkey.id,
        ${input.action},
        ${grantTokenHash},
        ${expiresAt.toISOString()}::timestamptz,
        ${now.toISOString()}::timestamptz
      from consumed
      cross join updated_passkey
      returning
        id
    `);

  if (!hasPasskeyStepUpReturnedRow(result)) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "PASSKEY_STEP_UP_CEREMONY_ALREADY_USED",
    };
  }

  await recordAuthSecurityEvent({
    eventType:
      "PASSKEY_STEP_UP_SUCCESS",
    identifierHash:
      securityFingerprint(
        "passkey-step-up",
        `${input.access.session.userId}:${input.action}`,
      ),
    userId:
      input.access.session.userId,
    reason:
      input.action,
  });

  return {
    ok: true as const,
    grant: {
      token:
        grantToken,
      action:
        input.action,
      expiresAt,
      shownOnce: true,
    },
  };
}

async function consumePasskeyStepUpGrantWithIdForActor(
  input: {
    token: string;
    access:
      PasskeyStepUpAccessLike;
    action:
      PasskeyStepUpAction;
    scope:
      PasskeyStepUpActorScope;
  },
): Promise<string | null> {
  if (
    !/^CASASTEP1\.[A-Za-z0-9_-]{43}$/.test(
      input.token,
    )
  ) {
    return null;
  }

  const db = getDb();
  const now =
    new Date();

  const actorCondition =
    input.scope ===
    "SCHOOL"
      ? and(
          eq(
            authPasskeyStepUpGrants.membershipId,
            input.access.membership.id,
          ),
          isNull(
            authPasskeyStepUpGrants.internalMembershipId,
          ),
        )
      : and(
          isNull(
            authPasskeyStepUpGrants.membershipId,
          ),
          eq(
            authPasskeyStepUpGrants.internalMembershipId,
            input.access.membership.id,
          ),
        );

  const rows =
    await db
      .update(
        authPasskeyStepUpGrants,
      )
      .set({
        consumedAt: now,
      })
      .where(
        and(
          eq(
            authPasskeyStepUpGrants.tokenHash,
            hashGrantToken(
              input.token,
            ),
          ),
          eq(
            authPasskeyStepUpGrants.userId,
            input.access.session.userId,
          ),
          eq(
            authPasskeyStepUpGrants.schoolId,
            input.access.school.id,
          ),
          actorCondition,
          eq(
            authPasskeyStepUpGrants.action,
            input.action,
          ),
          isNull(
            authPasskeyStepUpGrants.consumedAt,
          ),
          gt(
            authPasskeyStepUpGrants.expiresAt,
            now,
          ),
        ),
      )
      .returning({
        id:
          authPasskeyStepUpGrants.id,
      });

  return rows[0]?.id ?? null;
}

export async function beginPasskeyStepUp(
  access: SchoolAccess,
  action:
    PasskeyStepUpAction,
) {
  return beginPasskeyStepUpForActor(
    access,
    action,
    "SCHOOL",
  );
}

export async function finishPasskeyStepUp(
  input: {
    access: SchoolAccess;
    action:
      PasskeyStepUpAction;
    ceremonyId: string;
    response:
      AuthenticationResponseJSON;
  },
) {
  return finishPasskeyStepUpForActor({
    ...input,
    scope:
      "SCHOOL",
  });
}

export async function consumePasskeyStepUpGrantWithId(
  input: {
    token: string;
    access: SchoolAccess;
    action:
      PasskeyStepUpAction;
  },
): Promise<string | null> {
  return consumePasskeyStepUpGrantWithIdForActor({
    ...input,
    scope:
      "SCHOOL",
  });
}

export async function consumePasskeyStepUpGrant(
  input: {
    token: string;
    access: SchoolAccess;
    action:
      PasskeyStepUpAction;
  },
): Promise<boolean> {
  return Boolean(
    await consumePasskeyStepUpGrantWithId(
      input,
    ),
  );
}

export async function requirePasskeyStepUpGrant(
  input: {
    token:
      string | null | undefined;
    access: SchoolAccess;
    action:
      PasskeyStepUpAction;
  },
): Promise<void> {
  if (
    !input.token ||
    !(
      await consumePasskeyStepUpGrant({
        token:
          input.token,
        access:
          input.access,
        action:
          input.action,
      })
    )
  ) {
    throw new Error(
      "PASSKEY_STEP_UP_REQUIRED",
    );
  }
}

export async function beginCasaInternalPasskeyStepUp(
  access:
    PasskeyStepUpAccessLike,
  action:
    PasskeyStepUpAction,
) {
  return beginPasskeyStepUpForActor(
    access,
    action,
    "CASA_INTERNAL",
  );
}

export async function finishCasaInternalPasskeyStepUp(
  input: {
    access:
      PasskeyStepUpAccessLike;
    action:
      PasskeyStepUpAction;
    ceremonyId: string;
    response:
      AuthenticationResponseJSON;
  },
) {
  return finishPasskeyStepUpForActor({
    ...input,
    scope:
      "CASA_INTERNAL",
  });
}

export async function consumeCasaInternalPasskeyStepUpGrantWithId(
  input: {
    token: string;
    access:
      PasskeyStepUpAccessLike;
    action:
      PasskeyStepUpAction;
  },
): Promise<string | null> {
  return consumePasskeyStepUpGrantWithIdForActor({
    ...input,
    scope:
      "CASA_INTERNAL",
  });
}

export async function requireCasaInternalPasskeyStepUpGrant(
  input: {
    token:
      string | null | undefined;
    access:
      PasskeyStepUpAccessLike;
    action:
      PasskeyStepUpAction;
  },
): Promise<void> {
  if (
    !input.token ||
    !(
      await consumeCasaInternalPasskeyStepUpGrantWithId({
        token:
          input.token,
        access:
          input.access,
        action:
          input.action,
      })
    )
  ) {
    throw new Error(
      "PASSKEY_STEP_UP_REQUIRED",
    );
  }
}
