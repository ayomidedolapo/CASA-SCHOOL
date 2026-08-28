import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  authWebauthnChallengePurposeEnum,
} from "./passkey-enums";
import { schools } from "./schools";
import {
  schoolMemberships,
  users,
} from "./users";

export const authPasskeys =
  pgTable(
    "auth_passkeys",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      userId: uuid("user_id")
        .notNull()
        .references(
          () => users.id,
          {
            onDelete: "cascade",
          },
        ),
      credentialId: text(
        "credential_id",
      ).notNull(),
      publicKeyBase64url: text(
        "public_key_base64url",
      ).notNull(),
      webauthnUserId: varchar(
        "webauthn_user_id",
        {
          length: 256,
        },
      ).notNull(),
      counter: bigint(
        "counter",
        {
          mode: "number",
        },
      )
        .default(0)
        .notNull(),
      deviceType: varchar(
        "device_type",
        {
          length: 32,
        },
      ).notNull(),
      backedUp: boolean(
        "backed_up",
      )
        .default(false)
        .notNull(),
      transports: jsonb(
        "transports",
      )
        .$type<string[]>()
        .default([])
        .notNull(),
      label: varchar(
        "label",
        {
          length: 120,
        },
      ),
      lastUsedAt: timestamp(
        "last_used_at",
        {
          withTimezone: true,
        },
      ),
      revokedAt: timestamp(
        "revoked_at",
        {
          withTimezone: true,
        },
      ),
      createdAt: timestamp(
        "created_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
      updatedAt: timestamp(
        "updated_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
    },
    (table) => [
      unique(
        "auth_passkeys_credential_id_unique",
      ).on(
        table.credentialId,
      ),
      unique(
        "auth_passkeys_user_id_id_unique",
      ).on(
        table.userId,
        table.id,
      ),
      index(
        "auth_passkeys_user_active_idx",
      ).on(
        table.userId,
        table.revokedAt,
      ),
      check(
        "auth_passkeys_credential_id_not_blank_check",
        sql`length(trim(${table.credentialId})) > 0`,
      ),
      check(
        "auth_passkeys_public_key_not_blank_check",
        sql`length(trim(${table.publicKeyBase64url})) > 0`,
      ),
      check(
        "auth_passkeys_webauthn_user_id_not_blank_check",
        sql`length(trim(${table.webauthnUserId})) > 0`,
      ),
      check(
        "auth_passkeys_counter_nonnegative_check",
        sql`${table.counter} >= 0`,
      ),
    ],
  );

export const authWebauthnChallenges =
  pgTable(
    "auth_webauthn_challenges",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      userId: uuid(
        "user_id",
      ).references(
        () => users.id,
        {
          onDelete: "cascade",
        },
      ),
      schoolId: uuid(
        "school_id",
      ).references(
        () => schools.id,
        {
          onDelete: "cascade",
        },
      ),
      membershipId: uuid(
        "membership_id",
      ),
      purpose:
        authWebauthnChallengePurposeEnum(
          "purpose",
        ).notNull(),
      challenge: text(
        "challenge",
      ).notNull(),
      webauthnUserId: varchar(
        "webauthn_user_id",
        {
          length: 256,
        },
      ),
      action: varchar(
        "action",
        {
          length: 80,
        },
      ),
      expiresAt: timestamp(
        "expires_at",
        {
          withTimezone: true,
        },
      ).notNull(),
      usedAt: timestamp(
        "used_at",
        {
          withTimezone: true,
        },
      ),
      createdAt: timestamp(
        "created_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
    },
    (table) => [
      unique(
        "auth_webauthn_challenges_challenge_unique",
      ).on(
        table.challenge,
      ),
      index(
        "auth_webauthn_challenges_expiry_idx",
      ).on(
        table.expiresAt,
        table.usedAt,
      ),
      index(
        "auth_webauthn_challenges_user_purpose_idx",
      ).on(
        table.userId,
        table.purpose,
        table.createdAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.membershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "auth_webauthn_challenges_school_membership_fk",
      }),
      check(
        "auth_webauthn_challenges_challenge_not_blank_check",
        sql`length(trim(${table.challenge})) > 0`,
      ),
      check(
        "auth_webauthn_challenges_expiry_check",
        sql`${table.expiresAt} > ${table.createdAt}`,
      ),
      check(
        "auth_webauthn_challenges_registration_user_check",
        sql`${table.purpose} <> 'REGISTRATION' or (
          ${table.userId} is not null
          and ${table.webauthnUserId} is not null
        )`,
      ),
      check(
        "auth_webauthn_challenges_step_up_scope_check",
        sql`${table.purpose} <> 'STEP_UP' or (
          ${table.userId} is not null
          and ${table.schoolId} is not null
          and ${table.membershipId} is not null
          and ${table.action} is not null
          and length(trim(${table.action})) > 0
        )`,
      ),
      check(
        "auth_webauthn_challenges_non_step_up_action_check",
        sql`${table.purpose} = 'STEP_UP' or ${table.action} is null`,
      ),
    ],
  );

export const authPasskeyStepUpGrants =
  pgTable(
    "auth_passkey_step_up_grants",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      userId: uuid(
        "user_id",
      )
        .notNull()
        .references(
          () => users.id,
          {
            onDelete: "cascade",
          },
        ),
      schoolId: uuid(
        "school_id",
      )
        .notNull()
        .references(
          () => schools.id,
          {
            onDelete: "cascade",
          },
        ),
      membershipId: uuid(
        "membership_id",
      ).notNull(),
      challengeId: uuid(
        "challenge_id",
      )
        .notNull()
        .references(
          () =>
            authWebauthnChallenges.id,
          {
            onDelete: "cascade",
          },
        ),
      passkeyId: uuid(
        "passkey_id",
      )
        .notNull()
        .references(
          () => authPasskeys.id,
          {
            onDelete: "cascade",
          },
        ),
      action: varchar(
        "action",
        {
          length: 80,
        },
      ).notNull(),
      tokenHash: varchar(
        "token_hash",
        {
          length: 64,
        },
      ).notNull(),
      expiresAt: timestamp(
        "expires_at",
        {
          withTimezone: true,
        },
      ).notNull(),
      consumedAt: timestamp(
        "consumed_at",
        {
          withTimezone: true,
        },
      ),
      createdAt: timestamp(
        "created_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
    },
    (table) => [
      unique(
        "auth_passkey_step_up_grants_token_hash_unique",
      ).on(
        table.tokenHash,
      ),
      unique(
        "auth_passkey_step_up_grants_challenge_unique",
      ).on(
        table.challengeId,
      ),
      index(
        "auth_passkey_step_up_grants_scope_idx",
      ).on(
        table.schoolId,
        table.membershipId,
        table.action,
        table.expiresAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.membershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "auth_passkey_step_up_grants_school_membership_fk",
      }),
      check(
        "auth_passkey_step_up_grants_action_not_blank_check",
        sql`length(trim(${table.action})) > 0`,
      ),
      check(
        "auth_passkey_step_up_grants_token_hash_format_check",
        sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
      ),
      check(
        "auth_passkey_step_up_grants_expiry_check",
        sql`${table.expiresAt} > ${table.createdAt}`,
      ),
    ],
  );