import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { schoolStatusEnum } from "./enums";

export const schools = pgTable(
  "schools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    status: schoolStatusEnum("status")
      .default("ACTIVE")
      .notNull(),
    timezone: varchar("timezone", { length: 64 })
      .default("Africa/Lagos")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("schools_slug_unique").on(table.slug),
    check(
      "schools_slug_format_check",
      sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check(
      "schools_name_not_blank_check",
      sql`length(trim(${table.name})) > 0`,
    ),
  ],
);