import { sql } from "drizzle-orm";
import {
  boolean,
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

import { schoolMemberships } from "./users";
import { schools } from "./schools";
import { students } from "./students";
import {
  guardianStatusEnum,
} from "./student-enums";

export const guardians = pgTable(
  "guardians",
  {
    id: uuid("id")
      .defaultRandom()
      .primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(
        () => schools.id,
      ),
    membershipId: uuid(
      "membership_id",
    ),
    fullName: varchar("full_name", {
      length: 200,
    }).notNull(),
    email: varchar("email", {
      length: 320,
    }),
    phone: varchar("phone", {
      length: 32,
    }),
    status: guardianStatusEnum("status")
      .default("ACTIVE")
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
    unique(
      "guardians_school_id_id_unique",
    ).on(
      table.schoolId,
      table.id,
    ),
    uniqueIndex(
      "guardians_school_membership_unique_idx",
    )
      .on(
        table.schoolId,
        table.membershipId,
      )
      .where(
        sql`${table.membershipId} is not null`,
      ),
    index(
      "guardians_school_status_idx",
    ).on(
      table.schoolId,
      table.status,
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
      name: "guardians_school_membership_fk",
    }),
    check(
      "guardians_full_name_not_blank_check",
      sql`length(trim(${table.fullName})) > 0`,
    ),
    check(
      "guardians_contact_required_check",
      sql`${table.email} is not null or ${table.phone} is not null`,
    ),
    check(
      "guardians_email_normalized_check",
      sql`${table.email} is null or ${table.email} = lower(${table.email})`,
    ),
  ],
);

export const studentGuardians = pgTable(
  "student_guardians",
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
    guardianId: uuid("guardian_id")
      .notNull(),
    relationshipLabel: varchar(
      "relationship_label",
      {
        length: 80,
      },
    ).notNull(),
    isPrimary: boolean("is_primary")
      .default(false)
      .notNull(),
    isEmergencyContact: boolean(
      "is_emergency_contact",
    )
      .default(false)
      .notNull(),
    pickupAuthorized: boolean(
      "pickup_authorized",
    )
      .default(false)
      .notNull(),
    receivesNotifications: boolean(
      "receives_notifications",
    )
      .default(false)
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
    unique(
      "student_guardians_school_id_id_unique",
    ).on(
      table.schoolId,
      table.id,
    ),
    unique(
      "student_guardians_student_guardian_unique",
    ).on(
      table.schoolId,
      table.studentId,
      table.guardianId,
    ),
    uniqueIndex(
      "student_guardians_one_notification_recipient_per_student_idx",
    )
      .on(
        table.schoolId,
        table.studentId,
      )
      .where(
        sql`${table.receivesNotifications} = true`,
      ),
    uniqueIndex(
      "student_guardians_one_primary_per_student_idx",
    )
      .on(
        table.schoolId,
        table.studentId,
      )
      .where(
        sql`${table.isPrimary} = true`,
      ),
    index(
      "student_guardians_guardian_idx",
    ).on(
      table.schoolId,
      table.guardianId,
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
      name: "student_guardians_school_student_fk",
    }),
    foreignKey({
      columns: [
        table.schoolId,
        table.guardianId,
      ],
      foreignColumns: [
        guardians.schoolId,
        guardians.id,
      ],
      name: "student_guardians_school_guardian_fk",
    }),
    check(
      "student_guardians_relationship_not_blank_check",
      sql`length(trim(${table.relationshipLabel})) > 0`,
    ),
  ],
);