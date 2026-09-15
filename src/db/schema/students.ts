import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { schools } from "./schools";
import {
  studentSexEnum,
  studentStatusEnum,
} from "./student-enums";

export const students = pgTable(
  "students",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(
        () => schools.id,
      ),
    homeBranchId: uuid(
      "home_branch_id",
    ),
    casaStudentId: varchar(
      "casa_student_id",
      {
        length: 32,
      },
    )
      .default(
        sql`'CASA-STU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))`,
      )
      .notNull(),
    admissionNumber: varchar(
      "admission_number",
      {
        length: 64,
      },
    ),
    firstName: varchar("first_name", {
      length: 100,
    }).notNull(),
    middleName: varchar("middle_name", {
      length: 100,
    }),
    lastName: varchar("last_name", {
      length: 100,
    }).notNull(),
    preferredName: varchar(
      "preferred_name",
      {
        length: 100,
      },
    ),
    dateOfBirth: date(
      "date_of_birth",
    ).notNull(),
    sex: studentSexEnum("sex")
      .default("UNSPECIFIED")
      .notNull(),
    status: studentStatusEnum("status")
      .default("ACTIVE")
      .notNull(),
    admissionDate: date(
      "admission_date",
    ).notNull(),
    exitDate: date("exit_date"),
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
    unique(
      "students_school_id_id_unique",
    ).on(
      table.schoolId,
      table.id,
    ),
    unique(
      "students_casa_student_id_unique",
    ).on(
      table.casaStudentId,
    ),
    unique(
      "students_school_admission_number_unique",
    ).on(
      table.schoolId,
      table.admissionNumber,
    ),
    index(
      "students_school_status_idx",
    ).on(
      table.schoolId,
      table.status,
    ),
    index(
      "students_school_home_branch_status_idx",
    ).on(
      table.schoolId,
      table.homeBranchId,
      table.status,
    ),
    index(
      "students_school_name_idx",
    ).on(
      table.schoolId,
      table.lastName,
      table.firstName,
    ),
    check(
      "students_casa_student_id_format_check",
      sql`${table.casaStudentId} ~ '^CASA-STU-[0-9A-F]{16}$'`,
    ),
    check(
      "students_admission_number_not_blank_check",
      sql`${table.admissionNumber} is null or length(trim(${table.admissionNumber})) > 0`,
    ),
    check(
      "students_first_name_not_blank_check",
      sql`length(trim(${table.firstName})) > 0`,
    ),
    check(
      "students_last_name_not_blank_check",
      sql`length(trim(${table.lastName})) > 0`,
    ),
    check(
      "students_exit_after_admission_check",
      sql`${table.exitDate} is null or ${table.exitDate} >= ${table.admissionDate}`,
    ),
  ],
);