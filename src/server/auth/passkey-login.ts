import {
  and,
  eq,
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
  users,
} from "@/db/schema";

import {
  getUsablePasskeyChallenge,
  savePasskeyChallenge,
} from "./passkey-challenge";
import {
  getPasskeyRpConfig,
} from "./passkey-config";
import {
  toWebAuthnCredential,
} from "./passkey-credential";
import {
  recordAuthSecurityEvent,
  securityFingerprint,
} from "./security";
import {
  createAuthSession,
  setAuthSessionCookie,
} from "./session";

export async function beginPasskeyLogin() {
  const config =
    getPasskeyRpConfig();

  const options =
    await generateAuthenticationOptions({
      rpID:
        config.rpID,
      userVerification:
        "required",
    });

  const ceremony =
    await savePasskeyChallenge({
      purpose:
        "LOGIN",
      challenge:
        options.challenge,
    });

  return {
    ceremonyId:
      ceremony.ceremonyId,
    expiresAt:
      ceremony.expiresAt,
    options,
  };
}

export async function finishPasskeyLogin(
  input: {
    ceremonyId: string;
    response:
      AuthenticationResponseJSON;
  },
) {
  const challenge =
    await getUsablePasskeyChallenge(
      input.ceremonyId,
      "LOGIN",
    );

  if (!challenge) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "PASSKEY_LOGIN_CEREMONY_UNAVAILABLE",
    };
  }

  const db = getDb();

  const rows =
    await db
      .select({
        passkeyId:
          authPasskeys.id,
        userId:
          authPasskeys.userId,
        credentialId:
          authPasskeys.credentialId,
        publicKeyBase64url:
          authPasskeys.publicKeyBase64url,
        webauthnUserId:
          authPasskeys.webauthnUserId,
        counter:
          authPasskeys.counter,
        transports:
          authPasskeys.transports,
        userStatus:
          users.status,
      })
      .from(authPasskeys)
      .innerJoin(
        users,
        eq(
          authPasskeys.userId,
          users.id,
        ),
      )
      .where(
        and(
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

  if (
    !passkey ||
    passkey.userStatus !==
      "ACTIVE"
  ) {
    await recordAuthSecurityEvent({
      eventType:
        "PASSKEY_LOGIN_FAILURE",
      identifierHash:
        securityFingerprint(
          "passkey-credential",
          input.response.id,
        ),
      userId:
        passkey?.userId ?? null,
      reason:
        "PASSKEY_NOT_AVAILABLE",
    });

    return {
      ok: false as const,
      status: 401 as const,
      code:
        "PASSKEY_LOGIN_FAILED",
    };
  }

  const returnedUserHandle =
    input.response.response
      .userHandle;

  if (
    returnedUserHandle &&
    returnedUserHandle !==
      passkey.webauthnUserId
  ) {
    return {
      ok: false as const,
      status: 401 as const,
      code:
        "PASSKEY_USER_HANDLE_MISMATCH",
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
        "PASSKEY_LOGIN_FAILURE",
      identifierHash:
        securityFingerprint(
          "passkey-credential",
          input.response.id,
        ),
      userId:
        passkey.userId,
      reason:
        "PASSKEY_VERIFICATION_FAILED",
    });

    return {
      ok: false as const,
      status: 401 as const,
      code:
        "PASSKEY_LOGIN_FAILED",
    };
  }

  if (!verification.verified) {
    return {
      ok: false as const,
      status: 401 as const,
      code:
        "PASSKEY_LOGIN_FAILED",
    };
  }

  const now =
    new Date().toISOString();

  const consumed =
    await db.execute(sql`
      with consumed_challenge as (
        update auth_webauthn_challenges
        set
          used_at =
            ${now}::timestamptz
        where
          id =
            ${challenge.id}::uuid
          and purpose =
            'LOGIN'::auth_webauthn_challenge_purpose
          and used_at is null
          and expires_at > now()
        returning
          id
      )
      update auth_passkeys p
      set
        counter =
          ${verification.authenticationInfo.newCounter},
        last_used_at =
          ${now}::timestamptz,
        updated_at =
          ${now}::timestamptz
      from consumed_challenge
      where
        p.id =
          ${passkey.passkeyId}::uuid
        and p.revoked_at is null
      returning
        p.id
    `);

  // Drizzle/Neon may return either Row[] or QueryResult { rows }.
  // Treat a returned row as the authoritative proof that the
  // one-use login challenge was consumed and the credential
  // counter update committed.
  const consumedRows =
    Array.isArray(
      consumed,
    )
      ? consumed
      : consumed &&
          typeof consumed ===
            "object" &&
          "rows" in consumed &&
          Array.isArray(
            (
              consumed as {
                rows?: unknown;
              }
            ).rows,
          )
        ? (
            consumed as {
              rows: unknown[];
            }
          ).rows
        : [];

  if (!consumedRows[0]) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "PASSKEY_LOGIN_CEREMONY_ALREADY_USED",
    };
  }

  const session =
    await createAuthSession(
      passkey.userId,
    );

  await setAuthSessionCookie(
    session.token,
    session.expiresAt,
  );

  await recordAuthSecurityEvent({
    eventType:
      "PASSKEY_LOGIN_SUCCESS",
    identifierHash:
      securityFingerprint(
        "passkey-credential",
        passkey.credentialId,
      ),
    userId:
      passkey.userId,
  });

  return {
    ok: true as const,
    expiresAt:
      session.expiresAt,
  };
}