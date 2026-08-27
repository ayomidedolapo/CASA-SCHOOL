import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  academicSessions,
  classArms,
} from "./academic";
import { schools } from "./schools";
import { students } from "./students";
import {
  enrollmentStatusEnum,
} from "./student-enums";

export const studentEnrollments =
  pgTable(
    "student_enrollments",
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
      academicSessionId: uuid(
        "academic_session_id",
      ).notNull(),
      classArmId: uuid(
        "class_arm_id",
      ).notNull(),
      status: enrollmentStatusEnum(
        "status",
      )
        .default("ACTIVE")
        .notNull(),
      startsOn: date("starts_on")
        .notNull(),
      endsOn: date("ends_on"),
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
        "student_enrollments_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      uniqueIndex(
        "student_enrollments_one_active_per_student_idx",
      )
        .on(
          table.schoolId,
          table.studentId,
        )
        .where(
          sql`${table.status} = 'ACTIVE'`,
        ),
      index(
        "student_enrollments_class_arm_idx",
      ).on(
        table.schoolId,
        table.classArmId,
        table.status,
      ),
      index(
        "student_enrollments_session_idx",
      ).on(
        table.schoolId,
        table.academicSessionId,
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
        name: "student_enrollments_school_student_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.academicSessionId,
        ],
        foreignColumns: [
          academicSessions.schoolId,
          academicSessions.id,
        ],
        name: "student_enrollments_school_session_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.classArmId,
        ],
        foreignColumns: [
          classArms.schoolId,
          classArms.id,
        ],
        name: "student_enrollments_school_class_arm_fk",
      }),
      check(
        "student_enrollments_dates_check",
        sql`${table.endsOn} is null or ${table.endsOn} >= ${table.startsOn}`,
      ),
      check(
        "student_enrollments_status_end_date_check",
        sql`(
          (${table.status} = 'ACTIVE' and ${table.endsOn} is null)
          or
          (${table.status} <> 'ACTIVE' and ${table.endsOn} is not null)
        )`,
      ),
    ],
  );