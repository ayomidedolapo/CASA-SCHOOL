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
  studentBiometricProfileEventTypeEnum,
} from "./biometric-enums";
import { schools } from "./schools";
import {
  studentBiometricProfiles,
} from "./student-biometrics";
import { students } from "./students";
import {
  schoolMemberships,
} from "./users";

export const studentBiometricProfileEvents =
  pgTable(
    "student_biometric_profile_events",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      studentId: uuid(
        "student_id",
      ).notNull(),
      profileId: uuid(
        "profile_id",
      ).notNull(),
      previousProfileId: uuid(
        "previous_profile_id",
      ),
      actorMembershipId: uuid(
        "actor_membership_id",
      ).notNull(),
      eventType:
        studentBiometricProfileEventTypeEnum(
          "event_type",
        ).notNull(),
      provider: varchar(
        "provider",
        {
          length: 80,
        },
      ).notNull(),
      providerSubjectRef: varchar(
        "provider_subject_ref",
        {
          length: 180,
        },
      ).notNull(),
      reason: varchar(
        "reason",
        {
          length: 240,
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
        "student_biometric_profile_events_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      index(
        "student_biometric_profile_events_student_created_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.createdAt,
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
        name: "student_biometric_profile_events_school_student_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.profileId,
        ],
        foreignColumns: [
          studentBiometricProfiles.schoolId,
          studentBiometricProfiles.id,
        ],
        name: "student_biometric_profile_events_school_profile_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.previousProfileId,
        ],
        foreignColumns: [
          studentBiometricProfiles.schoolId,
          studentBiometricProfiles.id,
        ],
        name: "student_biometric_profile_events_school_previous_profile_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.actorMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "student_biometric_profile_events_school_actor_fk",
      }),
      check(
        "student_biometric_profile_events_provider_not_blank_check",
        sql`length(trim(${table.provider})) > 0`,
      ),
      check(
        "student_biometric_profile_events_subject_ref_not_blank_check",
        sql`length(trim(${table.providerSubjectRef})) > 0`,
      ),
      check(
        "student_biometric_profile_events_reenroll_previous_check",
        sql`${table.eventType} <> 'REENROLLED' or ${table.previousProfileId} is not null`,
      ),
      check(
        "student_biometric_profile_events_reason_check",
        sql`${table.reason} is null or length(trim(${table.reason})) > 0`,
      ),
    ],
  );