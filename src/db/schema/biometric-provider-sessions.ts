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
  attendanceTerminals,
  attendanceVerificationAttempts,
} from "./attendance";
import {
  biometricLivenessPurposeEnum,
  biometricLivenessStatusEnum,
  biometricProviderCleanupStatusEnum,
} from "./biometric-enums";
import { schools } from "./schools";
import { students } from "./students";
import {
  schoolMemberships,
} from "./users";

export const biometricLivenessSessions =
  pgTable(
    "biometric_liveness_sessions",
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
      attemptId: uuid(
        "attempt_id",
      ),
      terminalId: uuid(
        "terminal_id",
      ),
      initiatedByMembershipId:
        uuid(
          "initiated_by_membership_id",
        ),
      purpose:
        biometricLivenessPurposeEnum(
          "purpose",
        ).notNull(),
      authorizationAction:
        varchar(
          "authorization_action",
          {
            length: 40,
          },
        ),
      provider: varchar(
        "provider",
        {
          length: 80,
        },
      ).notNull(),
      providerSessionId:
        varchar(
          "provider_session_id",
          {
            length: 180,
          },
        ).notNull(),
      status:
        biometricLivenessStatusEnum(
          "status",
        )
          .default("CREATED")
          .notNull(),
      expiresAt: timestamp(
        "expires_at",
        {
          withTimezone: true,
        },
      ).notNull(),
      completedAt: timestamp(
        "completed_at",
        {
          withTimezone: true,
        },
      ),
      livenessConfidenceBps:
        integer(
          "liveness_confidence_bps",
        ),
      faceSimilarityBps: integer(
        "face_similarity_bps",
      ),
      providerSubjectRef:
        varchar(
          "provider_subject_ref",
          {
            length: 180,
          },
        ),
      failureCode: varchar(
        "failure_code",
        {
          length: 100,
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
        "biometric_liveness_sessions_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "biometric_liveness_sessions_provider_session_unique",
      ).on(
        table.provider,
        table.providerSessionId,
      ),
      uniqueIndex(
        "biometric_liveness_sessions_active_attempt_idx",
      )
        .on(
          table.schoolId,
          table.attemptId,
        )
        .where(
          sql`${table.purpose} = 'VERIFICATION' and ${table.status} = 'CREATED'`,
        ),
      uniqueIndex(
        "biometric_liveness_sessions_active_enrollment_idx",
      )
        .on(
          table.schoolId,
          table.studentId,
        )
        .where(
          sql`${table.purpose} = 'ENROLLMENT' and ${table.status} = 'CREATED'`,
        ),
      index(
        "biometric_liveness_sessions_status_expiry_idx",
      ).on(
        table.status,
        table.expiresAt,
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
        name: "biometric_liveness_sessions_school_student_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.attemptId,
        ],
        foreignColumns: [
          attendanceVerificationAttempts.schoolId,
          attendanceVerificationAttempts.id,
        ],
        name: "biometric_liveness_sessions_school_attempt_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.terminalId,
        ],
        foreignColumns: [
          attendanceTerminals.schoolId,
          attendanceTerminals.id,
        ],
        name: "biometric_liveness_sessions_school_terminal_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.initiatedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "biometric_liveness_sessions_school_membership_fk",
      }),
      check(
        "biometric_liveness_sessions_provider_not_blank_check",
        sql`length(trim(${table.provider})) > 0`,
      ),
      check(
        "biometric_liveness_sessions_provider_session_not_blank_check",
        sql`length(trim(${table.providerSessionId})) > 0`,
      ),
      check(
        "biometric_liveness_sessions_expiry_check",
        sql`${table.expiresAt} > ${table.createdAt}`,
      ),
      check(
        "biometric_liveness_sessions_scope_check",
        sql`(
          (
            ${table.purpose} = 'ENROLLMENT'
            and ${table.attemptId} is null
            and ${table.terminalId} is null
            and ${table.initiatedByMembershipId} is not null
            and ${table.authorizationAction} in (
              'BIOMETRIC_ENROLL',
              'BIOMETRIC_REENROLL'
            )
          )
          or
          (
            ${table.purpose} = 'VERIFICATION'
            and ${table.attemptId} is not null
            and ${table.terminalId} is not null
            and ${table.initiatedByMembershipId} is null
            and ${table.authorizationAction} is null
          )
        )`,
      ),
      check(
        "biometric_liveness_sessions_completed_check",
        sql`${table.status} <> 'COMPLETED' or ${table.completedAt} is not null`,
      ),
      check(
        "biometric_liveness_sessions_liveness_confidence_check",
        sql`${table.livenessConfidenceBps} is null or ${table.livenessConfidenceBps} between 0 and 10000`,
      ),
      check(
        "biometric_liveness_sessions_face_similarity_check",
        sql`${table.faceSimilarityBps} is null or ${table.faceSimilarityBps} between 0 and 10000`,
      ),
    ],
  );

export const biometricProviderCleanupJobs =
  pgTable(
    "biometric_provider_cleanup_jobs",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      provider: varchar(
        "provider",
        {
          length: 80,
        },
      ).notNull(),
      collectionRef: varchar(
        "collection_ref",
        {
          length: 255,
        },
      ).notNull(),
      subjectRef: varchar(
        "subject_ref",
        {
          length: 180,
        },
      ).notNull(),
      status:
        biometricProviderCleanupStatusEnum(
          "status",
        )
          .default("PENDING")
          .notNull(),
      attemptCount: integer(
        "attempt_count",
      )
        .default(0)
        .notNull(),
      availableAt: timestamp(
        "available_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
      completedAt: timestamp(
        "completed_at",
        {
          withTimezone: true,
        },
      ),
      lastError: varchar(
        "last_error",
        {
          length: 500,
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
        "biometric_provider_cleanup_jobs_target_unique",
      ).on(
        table.schoolId,
        table.provider,
        table.collectionRef,
        table.subjectRef,
      ),
      index(
        "biometric_provider_cleanup_jobs_work_idx",
      ).on(
        table.status,
        table.availableAt,
      ),
      check(
        "biometric_provider_cleanup_jobs_provider_not_blank_check",
        sql`length(trim(${table.provider})) > 0`,
      ),
      check(
        "biometric_provider_cleanup_jobs_collection_not_blank_check",
        sql`length(trim(${table.collectionRef})) > 0`,
      ),
      check(
        "biometric_provider_cleanup_jobs_subject_not_blank_check",
        sql`length(trim(${table.subjectRef})) > 0`,
      ),
      check(
        "biometric_provider_cleanup_jobs_attempt_count_check",
        sql`${table.attemptCount} >= 0`,
      ),
      check(
        "biometric_provider_cleanup_jobs_done_check",
        sql`${table.status} <> 'DONE' or ${table.completedAt} is not null`,
      ),
    ],
  );