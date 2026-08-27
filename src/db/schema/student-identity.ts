import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { schools } from "./schools";
import { students } from "./students";
import {
  studentIdentityCardStatusEnum,
} from "./student-enums";

export const studentIdentityCards =
  pgTable(
    "student_identity_cards",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      studentId: uuid("student_id")
        .notNull(),
      serialNumber: varchar(
        "serial_number",
        {
          length: 64,
        },
      ).notNull(),
      tokenHash: varchar(
        "token_hash",
        {
          length: 64,
        },
      ).notNull(),
      status:
        studentIdentityCardStatusEnum(
          "status",
        )
          .default("ACTIVE")
          .notNull(),
      issuedAt: timestamp(
        "issued_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
      expiresAt: timestamp(
        "expires_at",
        {
          withTimezone: true,
        },
      ),
      deactivatedAt: timestamp(
        "deactivated_at",
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
        "student_identity_cards_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "student_identity_cards_school_serial_unique",
      ).on(
        table.schoolId,
        table.serialNumber,
      ),
      unique(
        "student_identity_cards_token_hash_unique",
      ).on(
        table.tokenHash,
      ),
      uniqueIndex(
        "student_identity_cards_one_active_per_student_idx",
      )
        .on(
          table.schoolId,
          table.studentId,
        )
        .where(
          sql`${table.status} = 'ACTIVE'`,
        ),
      index(
        "student_identity_cards_student_status_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.status,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.studentId,
        ],
        foreignColumns: [
          students.schoolId,
          students.id,
        ],
        name: "student_identity_cards_school_student_fk",
      }),
      check(
        "student_identity_cards_serial_not_blank_check",
        sql`length(trim(${table.serialNumber})) > 0`,
      ),
      check(
        "student_identity_cards_token_hash_format_check",
        sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
      ),
      check(
        "student_identity_cards_expiry_after_issue_check",
        sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.issuedAt}`,
      ),
    ],
  );