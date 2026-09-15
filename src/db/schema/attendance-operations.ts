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

import {
  attendancePolicies,
  attendanceSessions,
  attendanceVerificationAttempts,
  studentAttendanceRecords,
} from "./attendance";
import {
  attendanceSessionEventTypeEnum,
} from "./attendance-operations-enums";
import {
  authPasskeyStepUpGrants,
} from "./passkeys";
import { schools } from "./schools";
import { students } from "./students";
import {
  schoolMemberships,
} from "./users";

export const attendanceSessionEvents =
  pgTable(
    "attendance_session_events",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid(
        "school_id",
      )
        .notNull()
        .references(
          () => schools.id,
        ),
      sessionId: uuid(
        "session_id",
      ).notNull(),
      actorMembershipId: uuid(
        "actor_membership_id",
      ).notNull(),
      eventType:
        attendanceSessionEventTypeEnum(
          "event_type",
        ).notNull(),
      reason: varchar(
        "reason",
        {
          length: 240,
        },
      ),
      occurredAt: timestamp(
        "occurred_at",
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
        "attendance_session_events_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      index(
        "attendance_session_events_session_type_idx",
      ).on(
        table.schoolId,
        table.sessionId,
        table.eventType,
        table.occurredAt,
      ),
      index(
        "attendance_session_events_session_occurred_idx",
      ).on(
        table.schoolId,
        table.sessionId,
        table.occurredAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.sessionId,
        ],
        foreignColumns: [
          attendanceSessions.schoolId,
          attendanceSessions.id,
        ],
        name: "attendance_session_events_school_session_fk",
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
        name: "attendance_session_events_school_actor_fk",
      }),
      check(
        "attendance_session_events_reason_check",
        sql`${table.reason} is null or length(trim(${table.reason})) > 0`,
      ),
    ],
  );

export const attendanceEarlyDepartureAuthorizations =
  pgTable(
    "attendance_early_departure_authorizations",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid(
        "school_id",
      )
        .notNull()
        .references(
          () => schools.id,
        ),
      sessionId: uuid(
        "session_id",
      ).notNull(),
      attemptId: uuid(
        "attempt_id",
      ).notNull(),
      studentId: uuid(
        "student_id",
      ).notNull(),
      attendanceRecordId: uuid(
        "attendance_record_id",
      ).notNull(),
      authorizedByMembershipId:
        uuid(
          "authorized_by_membership_id",
        ).notNull(),
      passkeyGrantId: uuid(
        "passkey_grant_id",
      ).notNull(),
      authorizationMethod:
        varchar(
          "authorization_method",
          {
            length: 20,
          },
        )
          .default("PASSKEY")
          .notNull(),
      reason: varchar(
        "reason",
        {
          length: 240,
        },
      ).notNull(),
      authorizedAt: timestamp(
        "authorized_at",
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
        "attendance_early_departure_authorizations_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "attendance_early_departure_authorizations_attempt_unique",
      ).on(
        table.schoolId,
        table.attemptId,
      ),
      index(
        "attendance_early_departure_authorizations_student_authorized_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.authorizedAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.sessionId,
        ],
        foreignColumns: [
          attendanceSessions.schoolId,
          attendanceSessions.id,
        ],
        name: "attendance_early_departure_authorizations_school_session_fk",
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
        name: "attendance_early_departure_authorizations_school_attempt_fk",
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
        name: "attendance_early_departure_authorizations_school_student_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.attendanceRecordId,
        ],
        foreignColumns: [
          studentAttendanceRecords.schoolId,
          studentAttendanceRecords.id,
        ],
        name: "attendance_early_departure_authorizations_school_record_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.authorizedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "attendance_early_departure_authorizations_school_actor_fk",
      }),
      foreignKey({
        columns: [
          table.passkeyGrantId,
        ],
        foreignColumns: [
          authPasskeyStepUpGrants.id,
        ],
        name: "attendance_early_departure_authorizations_passkey_grant_fk",
      }),
      check(
        "attendance_early_departure_authorizations_reason_not_blank_check",
        sql`length(trim(${table.reason})) > 0`,
      ),
      check(
        "attendance_early_departure_authorizations_method_check",
        sql`${table.authorizationMethod} = 'PASSKEY'`,
      ),
    ],
  );

export const attendanceEarlyDeparturePreauthorizations =
  pgTable(
    "attendance_early_departure_preauthorizations",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid(
        "school_id",
      )
        .notNull()
        .references(
          () => schools.id,
        ),
      sessionId: uuid(
        "session_id",
      ).notNull(),
      studentId: uuid(
        "student_id",
      ).notNull(),
      attendanceRecordId: uuid(
        "attendance_record_id",
      ).notNull(),
      authorizedByMembershipId:
        uuid(
          "authorized_by_membership_id",
        ).notNull(),
      passkeyGrantId: uuid(
        "passkey_grant_id",
      ).notNull(),
      reason: varchar(
        "reason",
        {
          length: 240,
        },
      ).notNull(),
      authorizedAt: timestamp(
        "authorized_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
      consumedAttemptId: uuid(
        "consumed_attempt_id",
      ),
      consumedAt: timestamp(
        "consumed_at",
        {
          withTimezone: true,
        },
      ),
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
    },
    (table) => [
      unique(
        "attendance_early_departure_preauthorizations_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      uniqueIndex(
        "attendance_early_departure_preauthorizations_active_student_idx",
      )
        .on(
          table.schoolId,
          table.sessionId,
          table.studentId,
        )
        .where(
          sql`${table.consumedAttemptId} is null and ${table.revokedAt} is null`,
        ),
      index(
        "attendance_early_departure_preauthorizations_student_authorized_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.authorizedAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.sessionId,
        ],
        foreignColumns: [
          attendanceSessions.schoolId,
          attendanceSessions.id,
        ],
        name:
          "attendance_early_departure_preauthorizations_school_session_fk",
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
        name:
          "attendance_early_departure_preauthorizations_school_student_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.attendanceRecordId,
        ],
        foreignColumns: [
          studentAttendanceRecords.schoolId,
          studentAttendanceRecords.id,
        ],
        name:
          "attendance_early_departure_preauthorizations_school_record_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.authorizedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "attendance_early_departure_preauthorizations_school_actor_fk",
      }),
      foreignKey({
        columns: [
          table.passkeyGrantId,
        ],
        foreignColumns: [
          authPasskeyStepUpGrants.id,
        ],
        name:
          "attendance_early_departure_preauthorizations_passkey_grant_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.consumedAttemptId,
        ],
        foreignColumns: [
          attendanceVerificationAttempts.schoolId,
          attendanceVerificationAttempts.id,
        ],
        name:
          "attendance_early_departure_preauthorizations_school_consumed_attempt_fk",
      }),
      check(
        "attendance_early_departure_preauthorizations_reason_not_blank_check",
        sql`length(trim(${table.reason})) > 0`,
      ),
      check(
        "attendance_early_departure_preauthorizations_consumed_pair_check",
        sql`(${table.consumedAttemptId} is null and ${table.consumedAt} is null) or (${table.consumedAttemptId} is not null and ${table.consumedAt} is not null)`,
      ),
    ],
  );

export const attendanceSessionPolicyRebinds =
  pgTable(
    "attendance_session_policy_rebinds",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid(
        "school_id",
      )
        .notNull()
        .references(
          () => schools.id,
        ),
      sessionId: uuid(
        "session_id",
      ).notNull(),
      fromPolicyId: uuid(
        "from_policy_id",
      ).notNull(),
      toPolicyId: uuid(
        "to_policy_id",
      ).notNull(),
      actorMembershipId: uuid(
        "actor_membership_id",
      ).notNull(),
      passkeyGrantId: uuid(
        "passkey_grant_id",
      ).notNull(),
      reason: varchar(
        "reason",
        {
          length: 240,
        },
      ).notNull(),
      reboundAt: timestamp(
        "rebound_at",
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
        "attendance_session_policy_rebinds_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "attendance_session_policy_rebinds_passkey_grant_unique",
      ).on(
        table.passkeyGrantId,
      ),
      index(
        "attendance_session_policy_rebinds_session_rebound_idx",
      ).on(
        table.schoolId,
        table.sessionId,
        table.reboundAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.sessionId,
        ],
        foreignColumns: [
          attendanceSessions.schoolId,
          attendanceSessions.id,
        ],
        name:
          "attendance_session_policy_rebinds_school_session_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.fromPolicyId,
        ],
        foreignColumns: [
          attendancePolicies.schoolId,
          attendancePolicies.id,
        ],
        name:
          "attendance_session_policy_rebinds_school_from_policy_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.toPolicyId,
        ],
        foreignColumns: [
          attendancePolicies.schoolId,
          attendancePolicies.id,
        ],
        name:
          "attendance_session_policy_rebinds_school_to_policy_fk",
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
        name:
          "attendance_session_policy_rebinds_school_actor_fk",
      }),
      foreignKey({
        columns: [
          table.passkeyGrantId,
        ],
        foreignColumns: [
          authPasskeyStepUpGrants.id,
        ],
        name:
          "attendance_session_policy_rebinds_passkey_grant_fk",
      }),
      check(
        "attendance_session_policy_rebinds_reason_not_blank_check",
        sql`length(trim(${table.reason})) > 0`,
      ),
      check(
        "attendance_session_policy_rebinds_policy_changed_check",
        sql`${table.fromPolicyId} <> ${table.toPolicyId}`,
      ),
    ],
  );

