import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { academicPeriodStatusEnum } from "./enums";
import { schools } from "./schools";

export const academicSessions = pgTable(
  "academic_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: academicPeriodStatusEnum("status")
      .default("PLANNED")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("academic_sessions_school_id_id_unique").on(
      table.schoolId,
      table.id,
    ),
    unique("academic_sessions_school_name_unique").on(
      table.schoolId,
      table.name,
    ),
    index("academic_sessions_school_status_idx").on(
      table.schoolId,
      table.status,
    ),
    check(
      "academic_sessions_date_order_check",
      sql`${table.endsOn} >= ${table.startsOn}`,
    ),
    check(
      "academic_sessions_name_not_blank_check",
      sql`length(trim(${table.name})) > 0`,
    ),
  ],
);

export const academicTerms = pgTable(
  "academic_terms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    academicSessionId: uuid("academic_session_id").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    position: smallint("position").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: academicPeriodStatusEnum("status")
      .default("PLANNED")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("academic_terms_school_id_id_unique").on(
      table.schoolId,
      table.id,
    ),
    unique("academic_terms_session_position_unique").on(
      table.academicSessionId,
      table.position,
    ),
    unique("academic_terms_session_name_unique").on(
      table.academicSessionId,
      table.name,
    ),
    index("academic_terms_school_status_idx").on(
      table.schoolId,
      table.status,
    ),
    foreignKey({
      columns: [table.schoolId, table.academicSessionId],
      foreignColumns: [
        academicSessions.schoolId,
        academicSessions.id,
      ],
      name: "academic_terms_school_session_fk",
    }).onDelete("cascade"),
    check(
      "academic_terms_position_positive_check",
      sql`${table.position} > 0`,
    ),
    check(
      "academic_terms_date_order_check",
      sql`${table.endsOn} >= ${table.startsOn}`,
    ),
    check(
      "academic_terms_name_not_blank_check",
      sql`length(trim(${table.name})) > 0`,
    ),
  ],
);

export const schoolSections = pgTable(
  "school_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 32 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("school_sections_school_id_id_unique").on(
      table.schoolId,
      table.id,
    ),
    unique("school_sections_school_name_unique").on(
      table.schoolId,
      table.name,
    ),
    index("school_sections_school_active_idx").on(
      table.schoolId,
      table.isActive,
    ),
    check(
      "school_sections_name_not_blank_check",
      sql`length(trim(${table.name})) > 0`,
    ),
  ],
);

export const classLevels = pgTable(
  "class_levels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    sectionId: uuid("section_id"),
    name: varchar("name", { length: 100 }).notNull(),
    code: varchar("code", { length: 32 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("class_levels_school_id_id_unique").on(
      table.schoolId,
      table.id,
    ),
    unique("class_levels_school_name_unique").on(
      table.schoolId,
      table.name,
    ),
    index("class_levels_school_active_idx").on(
      table.schoolId,
      table.isActive,
    ),
    foreignKey({
      columns: [table.schoolId, table.sectionId],
      foreignColumns: [
        schoolSections.schoolId,
        schoolSections.id,
      ],
      name: "class_levels_school_section_fk",
    }).onDelete("restrict"),
    check(
      "class_levels_name_not_blank_check",
      sql`length(trim(${table.name})) > 0`,
    ),
  ],
);

export const classArms = pgTable(
  "class_arms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    classLevelId: uuid("class_level_id").notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    code: varchar("code", { length: 32 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("class_arms_school_id_id_unique").on(
      table.schoolId,
      table.id,
    ),
    unique("class_arms_level_name_unique").on(
      table.classLevelId,
      table.name,
    ),
    index("class_arms_school_active_idx").on(
      table.schoolId,
      table.isActive,
    ),
    foreignKey({
      columns: [table.schoolId, table.classLevelId],
      foreignColumns: [
        classLevels.schoolId,
        classLevels.id,
      ],
      name: "class_arms_school_level_fk",
    }).onDelete("cascade"),
    check(
      "class_arms_name_not_blank_check",
      sql`length(trim(${table.name})) > 0`,
    ),
  ],
);