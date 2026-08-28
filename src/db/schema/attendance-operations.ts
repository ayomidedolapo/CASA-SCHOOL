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
      unique(
        "attendance_session_events_session_type_unique",
      ).on(
        table.schoolId,
        table.sessionId,
        table.eventType,
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
      unique(
        "attendance_early_departure_authorizations_grant_unique",
      ).on(
        table.passkeyGrantId,
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