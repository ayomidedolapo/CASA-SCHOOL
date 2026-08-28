import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  attendanceVerificationAttempts,
} from "./attendance";
import {
  studentBiometricProfileStatusEnum,
} from "./biometric-enums";
import { schools } from "./schools";
import { students } from "./students";
import {
  schoolMemberships,
} from "./users";

export const studentBiometricProfiles =
  pgTable(
    "student_biometric_profiles",
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
      status:
        studentBiometricProfileStatusEnum(
          "status",
        )
          .default("ACTIVE")
          .notNull(),
      enrolledByMembershipId:
        uuid(
          "enrolled_by_membership_id",
        ).notNull(),
      enrolledAt: timestamp(
        "enrolled_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
      revokedAt: timestamp(
        "revoked_at",
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
        "student_biometric_profiles_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      uniqueIndex(
        "student_biometric_profiles_one_active_per_student_idx",
      )
        .on(
          table.schoolId,
          table.studentId,
        )
        .where(
          sql`${table.status} = 'ACTIVE'`,
        ),
      unique(
        "student_biometric_profiles_provider_subject_unique",
      ).on(
        table.schoolId,
        table.provider,
        table.providerSubjectRef,
      ),
      index(
        "student_biometric_profiles_student_status_idx",
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
        name: "student_biometric_profiles_school_student_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.enrolledByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "student_biometric_profiles_school_enroller_fk",
      }),
      check(
        "student_biometric_profiles_provider_not_blank_check",
        sql`length(trim(${table.provider})) > 0`,
      ),
      check(
        "student_biometric_profiles_subject_ref_not_blank_check",
        sql`length(trim(${table.providerSubjectRef})) > 0`,
      ),
      check(
        "student_biometric_profiles_revoke_timestamp_check",
        sql`${table.status} <> 'REVOKED' or ${table.revokedAt} is not null`,
      ),
    ],
  );

export const biometricVerificationEvidence =
  pgTable(
    "biometric_verification_evidence",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      attemptId: uuid(
        "attempt_id",
      ).notNull(),
      studentId: uuid(
        "student_id",
      ).notNull(),
      profileId: uuid(
        "profile_id",
      ).notNull(),
      assertionId: varchar(
        "assertion_id",
        {
          length: 64,
        },
      ).notNull(),
      provider: varchar(
        "provider",
        {
          length: 80,
        },
      ).notNull(),
      providerVerificationId:
        varchar(
          "provider_verification_id",
          {
            length: 180,
          },
        ).notNull(),
      faceConfidenceBps: integer(
        "face_confidence_bps",
      ).notNull(),
      livenessConfidenceBps:
        integer(
          "liveness_confidence_bps",
        ).notNull(),
      assertionIssuedAt: timestamp(
        "assertion_issued_at",
        {
          withTimezone: true,
        },
      ).notNull(),
      verifiedAt: timestamp(
        "verified_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
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
        "biometric_verification_evidence_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "biometric_verification_evidence_attempt_unique",
      ).on(
        table.schoolId,
        table.attemptId,
      ),
      unique(
        "biometric_verification_evidence_assertion_unique",
      ).on(
        table.assertionId,
      ),
      unique(
        "biometric_verification_evidence_provider_verification_unique",
      ).on(
        table.schoolId,
        table.provider,
        table.providerVerificationId,
      ),
      index(
        "biometric_verification_evidence_student_verified_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.verifiedAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.attemptId,
        ],
        foreignColumns: [
          attendanceVerificationAttempts.schoolId,
          attendanceVerificationAttempts.id,
        ],
        name: "biometric_verification_evidence_school_attempt_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.studentId,
        ],
        foreignColumns: [
          students.schoolId,
          students.id,
        ],
        name: "biometric_verification_evidence_school_student_fk",
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
        name: "biometric_verification_evidence_school_profile_fk",
      }),
      check(
        "biometric_verification_evidence_assertion_id_check",
        sql`${table.assertionId} ~ '^[A-Za-z0-9_-]{16,64}$'`,
      ),
      check(
        "biometric_verification_evidence_provider_not_blank_check",
        sql`length(trim(${table.provider})) > 0`,
      ),
      check(
        "biometric_verification_evidence_provider_verification_not_blank_check",
        sql`length(trim(${table.providerVerificationId})) > 0`,
      ),
      check(
        "biometric_verification_evidence_face_confidence_check",
        sql`${table.faceConfidenceBps} between 0 and 10000`,
      ),
      check(
        "biometric_verification_evidence_liveness_confidence_check",
        sql`${table.livenessConfidenceBps} between 0 and 10000`,
      ),
    ],
  );