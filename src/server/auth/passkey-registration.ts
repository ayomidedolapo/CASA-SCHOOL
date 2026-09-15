import {
  and,
  eq,
  isNull,
  sql,
} from "drizzle-orm";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

import { getDb } from "@/db";
import {
  authPasskeys,
} from "@/db/schema";

import {
  getUsablePasskeyChallenge,
  savePasskeyChallenge,
} from "./passkey-challenge";
import {
  getPasskeyRpConfig,
} from "./passkey-config";
import {
  encodePasskeyPublicKey,
  parseStoredTransports,
} from "./passkey-credential";
import {
  recordAuthSecurityEvent,
  securityFingerprint,
} from "./security";
import type {
  CurrentAuthSession,
} from "./session";

export async function beginPasskeyRegistration(
  session:
    CurrentAuthSession,
) {
  const config =
    getPasskeyRpConfig();

  const db = getDb();

  const existing =
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
            session.userId,
          ),
          isNull(
            authPasskeys.revokedAt,
          ),
        ),
      );

  const userName =
    session.email ??
    session.phone ??
    `user-${session.userId}`;

  const options =
    await generateRegistrationOptions({
      rpName:
        config.rpName,
      rpID:
        config.rpID,
      userName,
      userDisplayName:
        session.fullName,
      userID:
        Buffer.from(
          session.userId,
          "utf8",
        ),
      attestationType:
        "none",
      excludeCredentials:
        existing.map(
          (passkey) => ({
            id:
              passkey.credentialId,
            transports:
              parseStoredTransports(
                passkey.transports,
              ),
          }),
        ),
      authenticatorSelection: {
        residentKey:
          "required",
        userVerification:
          "required",
      },
    });

  const ceremony =
    await savePasskeyChallenge({
      purpose:
        "REGISTRATION",
      challenge:
        options.challenge,
      userId:
        session.userId,
      webauthnUserId:
        options.user.id,
    });

  return {
    ceremonyId:
      ceremony.ceremonyId,
    expiresAt:
      ceremony.expiresAt,
    options,
  };
}

export async function finishPasskeyRegistration(
  input: {
    session:
      CurrentAuthSession;
    ceremonyId: string;
    response:
      RegistrationResponseJSON;
    label?:
      string | null;
  },
) {
  const challenge =
    await getUsablePasskeyChallenge(
      input.ceremonyId,
      "REGISTRATION",
    );

  if (
    !challenge ||
    challenge.userId !==
      input.session.userId ||
    !challenge.webauthnUserId
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "PASSKEY_REGISTRATION_CEREMONY_UNAVAILABLE",
    };
  }

  const config =
    getPasskeyRpConfig();

  let verification;

  try {
    verification =
      await verifyRegistrationResponse({
        response:
          input.response,
        expectedChallenge:
          challenge.challenge,
        expectedOrigin:
          config.expectedOrigins,
        expectedRPID:
          config.rpID,
        requireUserVerification:
          true,
      });
  } catch {
    await recordAuthSecurityEvent({
      eventType:
        "PASSKEY_STEP_UP_FAILURE",
      identifierHash:
        securityFingerprint(
          "passkey-registration",
          input.session.userId,
        ),
      userId:
        input.session.userId,
      reason:
        "REGISTRATION_VERIFICATION_FAILED",
    });

    return {
      ok: false as const,
      status: 422 as const,
      code:
        "PASSKEY_REGISTRATION_VERIFICATION_FAILED",
    };
  }

  if (
    !verification.verified ||
    !verification.registrationInfo
  ) {
    return {
      ok: false as const,
      status: 422 as const,
      code:
        "PASSKEY_REGISTRATION_NOT_VERIFIED",
    };
  }

  const {
    credential,
    credentialDeviceType,
    credentialBackedUp,
  } =
    verification.registrationInfo;

  const publicKey =
    encodePasskeyPublicKey(
      credential.publicKey,
    );

  const transports =
    credential.transports ??
    [];

  const now =
    new Date().toISOString();

  const db = getDb();

  const result =
    await db.execute(sql`
      with consumed as (
        update auth_webauthn_challenges
        set
          used_at =
            ${now}::timestamptz
        where
          id =
            ${challenge.id}::uuid
          and user_id =
            ${input.session.userId}::uuid
          and purpose =
            'REGISTRATION'::auth_webauthn_challenge_purpose
          and used_at is null
          and expires_at > now()
        returning
          id
      )
      insert into auth_passkeys (
        user_id,
        credential_id,
        public_key_base64url,
        webauthn_user_id,
        counter,
        device_type,
        backed_up,
        transports,
        label,
        created_at,
        updated_at
      )
      select
        ${input.session.userId}::uuid,
        ${credential.id},
        ${publicKey},
        ${challenge.webauthnUserId},
        ${credential.counter},
        ${credentialDeviceType},
        ${credentialBackedUp},
        ${JSON.stringify(transports)}::jsonb,
        ${input.label?.trim() || null},
        ${now}::timestamptz,
        ${now}::timestamptz
      from consumed
      on conflict (
        credential_id
      ) do nothing
      returning
        id,
        credential_id
    `);

  // Drizzle/Neon may return either Row[] or QueryResult { rows }.
  // The INSERT itself is authoritative; do not report a false
  // 409 merely because the adapter wrapped RETURNING rows.
  const resultRows =
    Array.isArray(
      result,
    )
      ? result
      : result &&
          typeof result ===
            "object" &&
          "rows" in result &&
          Array.isArray(
            (
              result as {
                rows?: unknown;
              }
            ).rows,
          )
        ? (
            result as {
              rows: unknown[];
            }
          ).rows
        : [];

  const inserted =
    resultRows[0] ??
    null;

  if (!inserted) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "PASSKEY_REGISTRATION_ALREADY_USED",
    };
  }

  await recordAuthSecurityEvent({
    eventType:
      "PASSKEY_REGISTERED",
    identifierHash:
      securityFingerprint(
        "passkey-credential",
        credential.id,
      ),
    userId:
      input.session.userId,
  });

  return {
    ok: true as const,
    passkey: {
      id:
        (
          inserted as {
            id: string;
          }
        ).id,
      credentialId:
        credential.id,
      deviceType:
        credentialDeviceType,
      backedUp:
        credentialBackedUp,
      transports,
    },
  };
}