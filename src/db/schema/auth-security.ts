import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const authLoginEvents = pgTable(
  "auth_login_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(
      () => users.id,
      {
        onDelete: "set null",
      },
    ),
    eventType: varchar("event_type", {
      length: 40,
    }).notNull(),
    reason: varchar("reason", {
      length: 80,
    }),
    identifierHash: varchar(
      "identifier_hash",
      {
        length: 64,
      },
    ).notNull(),
    sourceAddressHash: varchar(
      "source_address_hash",
      {
        length: 64,
      },
    ),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("auth_login_events_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("auth_login_events_identifier_created_idx").on(
      table.identifierHash,
      table.createdAt,
    ),
    index("auth_login_events_type_created_idx").on(
      table.eventType,
      table.createdAt,
    ),
    check(
      "auth_login_events_identifier_hash_format_check",
      sql`${table.identifierHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "auth_login_events_source_hash_format_check",
      sql`${table.sourceAddressHash} is null or ${table.sourceAddressHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    scope: varchar("scope", {
      length: 32,
    }).notNull(),
    keyHash: varchar("key_hash", {
      length: 64,
    }).notNull(),
    windowStartedAt: timestamp(
      "window_started_at",
      {
        withTimezone: true,
      },
    )
      .defaultNow()
      .notNull(),
    failureCount: integer(
      "failure_count",
    )
      .default(0)
      .notNull(),
    blockedUntil: timestamp(
      "blocked_until",
      {
        withTimezone: true,
      },
    ),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.scope,
        table.keyHash,
      ],
      name: "auth_rate_limits_pk",
    }),
    index("auth_rate_limits_blocked_idx").on(
      table.blockedUntil,
    ),
    check(
      "auth_rate_limits_key_hash_format_check",
      sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "auth_rate_limits_failure_count_check",
      sql`${table.failureCount} >= 0`,
    ),
  ],
);