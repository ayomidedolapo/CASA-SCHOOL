import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const authPasswordCredentials = pgTable(
  "auth_password_credentials",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, {
        onDelete: "cascade",
      }),
    passwordHash: varchar("password_hash", {
      length: 512,
    }).notNull(),
    mustChangePassword: boolean("must_change_password")
      .default(false)
      .notNull(),
    passwordChangedAt: timestamp("password_changed_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "auth_password_credentials_hash_not_blank_check",
      sql`length(trim(${table.passwordHash})) > 0`,
    ),
  ],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),
    tokenHash: varchar("token_hash", {
      length: 64,
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
    }).notNull(),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
    }),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("auth_sessions_token_hash_unique").on(
      table.tokenHash,
    ),
    index("auth_sessions_user_idx").on(
      table.userId,
    ),
    index("auth_sessions_expires_idx").on(
      table.expiresAt,
    ),
    check(
      "auth_sessions_token_hash_format_check",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "auth_sessions_expiry_after_creation_check",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);