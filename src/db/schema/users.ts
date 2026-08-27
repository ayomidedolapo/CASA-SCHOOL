import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  schoolMembershipRoleEnum,
  schoolMembershipStatusEnum,
  userStatusEnum,
} from "./enums";
import { schools } from "./schools";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 16 }),
    status: userStatusEnum("status")
      .default("ACTIVE")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("users_email_unique").on(table.email),
    unique("users_phone_unique").on(table.phone),
    check(
      "users_identity_required_check",
      sql`${table.email} is not null or ${table.phone} is not null`,
    ),
    check(
      "users_full_name_not_blank_check",
      sql`length(trim(${table.fullName})) > 0`,
    ),
    check(
      "users_email_normalized_check",
      sql`${table.email} is null or ${table.email} = lower(trim(${table.email}))`,
    ),
    check(
      "users_phone_e164_check",
      sql`${table.phone} is null or ${table.phone} ~ '^\+[1-9][0-9]{7,14}$'`,
    ),
  ],
);

export const schoolMemberships = pgTable(
  "school_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: schoolMembershipStatusEnum("status")
      .default("ACTIVE")
      .notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("school_memberships_school_id_id_unique").on(
      table.schoolId,
      table.id,
    ),
    unique("school_memberships_school_user_unique").on(
      table.schoolId,
      table.userId,
    ),
    index("school_memberships_user_idx").on(table.userId),
    index("school_memberships_school_status_idx").on(
      table.schoolId,
      table.status,
    ),
  ],
);

export const schoolMembershipRoles = pgTable(
  "school_membership_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    role: schoolMembershipRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("school_membership_roles_membership_role_unique").on(
      table.membershipId,
      table.role,
    ),
    index("school_membership_roles_school_role_idx").on(
      table.schoolId,
      table.role,
    ),
    foreignKey({
      columns: [table.schoolId, table.membershipId],
      foreignColumns: [
        schoolMemberships.schoolId,
        schoolMemberships.id,
      ],
      name: "school_membership_roles_school_membership_fk",
    }).onDelete("cascade"),
  ],
);