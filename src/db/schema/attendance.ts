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
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  attendanceAttemptOutcomeEnum,
  attendanceCardResultEnum,
  attendanceDepartureResultEnum,
  attendanceFaceResultEnum,
  attendanceLivenessResultEnum,
  attendanceOperationEnum,
  attendancePresenceEventTypeEnum,
  attendancePresenceStateEnum,
  attendanceRecordStatusEnum,
  attendanceSessionStatusEnum,
  attendanceTerminalEventTypeEnum,
  attendanceTerminalStatusEnum,
  attendanceTimeResultEnum,
} from "./attendance-enums";
import { schools } from "./schools";
import {
  studentIdentityCards,
} from "./student-identity";
import { students } from "./students";
import {
  schoolMemberships,
} from "./users";

export const attendancePolicies =
  pgTable(
    "attendance_policies",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      name: varchar("name", {
        length: 120,
      }).notNull(),
      isDefault: boolean(
        "is_default",
      )
        .default(false)
        .notNull(),
      isActive: boolean(
        "is_active",
      )
        .default(true)
        .notNull(),
      validFrom: date(
        "valid_from",
      ).notNull(),
      validTo: date(
        "valid_to",
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
        "attendance_policies_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      uniqueIndex(
        "attendance_policies_one_default_active_per_school_idx",
      )
        .on(
          table.schoolId,
        )
        .where(
          sql`${table.isDefault} = true and ${table.isActive} = true`,
        ),
      index(
        "attendance_policies_school_active_idx",
      ).on(
        table.schoolId,
        table.isActive,
      ),
      check(
        "attendance_policies_name_not_blank_check",
        sql`length(trim(${table.name})) > 0`,
      ),
      check(
        "attendance_policies_valid_dates_check",
        sql`${table.validTo} is null or ${table.validTo} >= ${table.validFrom}`,
      ),
    ],
  );

export const attendancePolicyDays =
  pgTable(
    "attendance_policy_days",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      policyId: uuid(
        "policy_id",
      ).notNull(),
      weekday: smallint(
        "weekday",
      ).notNull(),
      checkInOpensAt: time(
        "check_in_opens_at",
        {
          withTimezone: false,
        },
      ).notNull(),
      onTimeUntil: time(
        "on_time_until",
        {
          withTimezone: false,
        },
      ).notNull(),
      checkInClosesAt: time(
        "check_in_closes_at",
        {
          withTimezone: false,
        },
      ).notNull(),
      normalDismissalAt: time(
        "normal_dismissal_at",
        {
          withTimezone: false,
        },
      ).notNull(),
      checkOutClosesAt: time(
        "check_out_closes_at",
        {
          withTimezone: false,
        },
      ).notNull(),
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
        "attendance_policy_days_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "attendance_policy_days_policy_weekday_unique",
      ).on(
        table.schoolId,
        table.policyId,
        table.weekday,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.policyId,
        ],
        foreignColumns: [
          attendancePolicies.schoolId,
          attendancePolicies.id,
        ],
        name: "attendance_policy_days_school_policy_fk",
      }),
      check(
        "attendance_policy_days_weekday_check",
        sql`${table.weekday} between 0 and 6`,
      ),
      check(
        "attendance_policy_days_time_order_check",
        sql`${table.checkInOpensAt} <= ${table.onTimeUntil} and ${table.onTimeUntil} <= ${table.checkInClosesAt}`,
      ),
      check(
        "attendance_policy_days_departure_time_order_check",
        sql`${table.normalDismissalAt} <= ${table.checkOutClosesAt}`,
      ),
    ],
  );

export const attendanceTerminals =
  pgTable(
    "attendance_terminals",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      name: varchar("name", {
        length: 120,
      }).notNull(),
      terminalCode: varchar(
        "terminal_code",
        {
          length: 64,
        },
      ).notNull(),
      secretHash: varchar(
        "secret_hash",
        {
          length: 64,
        },
      ).notNull(),
      credentialVersion: integer(
        "credential_version",
      )
        .default(1)
        .notNull(),
      status:
        attendanceTerminalStatusEnum(
          "status",
        )
          .default("ACTIVE")
          .notNull(),
      provisionedByMembershipId:
        uuid(
          "provisioned_by_membership_id",
        ).notNull(),
      lastSeenAt: timestamp(
        "last_seen_at",
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
        "attendance_terminals_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "attendance_terminals_school_code_unique",
      ).on(
        table.schoolId,
        table.terminalCode,
      ),
      unique(
        "attendance_terminals_secret_hash_unique",
      ).on(
        table.secretHash,
      ),
      index(
        "attendance_terminals_school_status_idx",
      ).on(
        table.schoolId,
        table.status,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.provisionedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "attendance_terminals_school_provisioner_fk",
      }),
      check(
        "attendance_terminals_name_not_blank_check",
        sql`length(trim(${table.name})) > 0`,
      ),
      check(
        "attendance_terminals_code_not_blank_check",
        sql`length(trim(${table.terminalCode})) > 0`,
      ),
      check(
        "attendance_terminals_secret_hash_format_check",
        sql`${table.secretHash} ~ '^[0-9a-f]{64}$'`,
      ),
      check(
        "attendance_terminals_credential_version_check",
        sql`${table.credentialVersion} >= 1`,
      ),
    ],
  );

export const attendanceTerminalEvents =
  pgTable(
    "attendance_terminal_events",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      terminalId: uuid(
        "terminal_id",
      ).notNull(),
      actorMembershipId: uuid(
        "actor_membership_id",
      ).notNull(),
      eventType:
        attendanceTerminalEventTypeEnum(
          "event_type",
        ).notNull(),
      credentialVersion: integer(
        "credential_version",
      ).notNull(),
      reason: varchar("reason", {
        length: 240,
      }),
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
        "attendance_terminal_events_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      index(
        "attendance_terminal_events_terminal_created_idx",
      ).on(
        table.schoolId,
        table.terminalId,
        table.createdAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.terminalId,
        ],
        foreignColumns: [
          attendanceTerminals.schoolId,
          attendanceTerminals.id,
        ],
        name: "attendance_terminal_events_school_terminal_fk",
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
        name: "attendance_terminal_events_school_actor_fk",
      }),
      check(
        "attendance_terminal_events_credential_version_check",
        sql`${table.credentialVersion} >= 1`,
      ),
      check(
        "attendance_terminal_events_reason_check",
        sql`${table.reason} is null or length(trim(${table.reason})) > 0`,
      ),
    ],
  );

export const attendanceSessions =
  pgTable(
    "attendance_sessions",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      policyId: uuid(
        "policy_id",
      ).notNull(),
      attendanceDate: date(
        "attendance_date",
      ).notNull(),
      status:
        attendanceSessionStatusEnum(
          "status",
        )
          .default("PLANNED")
          .notNull(),
      openedAt: timestamp(
        "opened_at",
        {
          withTimezone: true,
        },
      ),
      closedAt: timestamp(
        "closed_at",
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
        "attendance_sessions_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "attendance_sessions_school_date_unique",
      ).on(
        table.schoolId,
        table.attendanceDate,
      ),
      index(
        "attendance_sessions_school_status_date_idx",
      ).on(
        table.schoolId,
        table.status,
        table.attendanceDate,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.policyId,
        ],
        foreignColumns: [
          attendancePolicies.schoolId,
          attendancePolicies.id,
        ],
        name: "attendance_sessions_school_policy_fk",
      }),
      check(
        "attendance_sessions_open_close_order_check",
        sql`${table.closedAt} is null or (${table.openedAt} is not null and ${table.closedAt} >= ${table.openedAt})`,
      ),
      check(
        "attendance_sessions_status_timestamps_check",
        sql`(
          (${table.status} = 'PLANNED' and ${table.openedAt} is null and ${table.closedAt} is null)
          or
          (${table.status} = 'OPEN' and ${table.openedAt} is not null and ${table.closedAt} is null)
          or
          (${table.status} = 'CLOSED' and ${table.openedAt} is not null and ${table.closedAt} is not null)
          or
          (${table.status} = 'CANCELLED')
        )`,
      ),
    ],
  );

export const attendanceVerificationAttempts =
  pgTable(
    "attendance_verification_attempts",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      sessionId: uuid(
        "session_id",
      ).notNull(),
      terminalId: uuid(
        "terminal_id",
      ).notNull(),
      terminalRequestId: varchar(
        "terminal_request_id",
        {
          length: 64,
        },
      ).notNull(),
      studentId: uuid(
        "student_id",
      ),
      cardId: uuid("card_id"),
      scannedTokenHash: varchar(
        "scanned_token_hash",
        {
          length: 64,
        },
      ).notNull(),
      operation:
        attendanceOperationEnum(
          "operation",
        )
          .default("CHECK_IN")
          .notNull(),
      cardResult:
        attendanceCardResultEnum(
          "card_result",
        )
          .default("PENDING")
          .notNull(),
      faceResult:
        attendanceFaceResultEnum(
          "face_result",
        )
          .default("NOT_RUN")
          .notNull(),
      faceConfidenceBps: integer(
        "face_confidence_bps",
      ),
      livenessResult:
        attendanceLivenessResultEnum(
          "liveness_result",
        )
          .default("NOT_RUN")
          .notNull(),
      livenessConfidenceBps:
        integer(
          "liveness_confidence_bps",
        ),
      timeResult:
        attendanceTimeResultEnum(
          "time_result",
        )
          .default("NOT_RUN")
          .notNull(),
      departureResult:
        attendanceDepartureResultEnum(
          "departure_result",
        )
          .default("NOT_RUN")
          .notNull(),
      outcome:
        attendanceAttemptOutcomeEnum(
          "outcome",
        )
          .default("PENDING")
          .notNull(),
      reasonCode: varchar(
        "reason_code",
        {
          length: 80,
        },
      ),
      manualVerifiedByMembershipId:
        uuid(
          "manual_verified_by_membership_id",
        ),
      occurredAt: timestamp(
        "occurred_at",
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
        "attendance_verification_attempts_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "attendance_attempts_terminal_request_unique",
      ).on(
        table.schoolId,
        table.terminalId,
        table.terminalRequestId,
      ),
      index(
        "attendance_attempts_session_occurred_idx",
      ).on(
        table.schoolId,
        table.sessionId,
        table.occurredAt,
      ),
      index(
        "attendance_attempts_student_occurred_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.occurredAt,
      ),
      index(
        "attendance_attempts_outcome_idx",
      ).on(
        table.schoolId,
        table.outcome,
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
        name: "attendance_attempts_school_session_fk",
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
        name: "attendance_attempts_school_terminal_fk",
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
        name: "attendance_attempts_school_student_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.cardId,
        ],
        foreignColumns: [
          studentIdentityCards.schoolId,
          studentIdentityCards.id,
        ],
        name: "attendance_attempts_school_card_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.manualVerifiedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "attendance_attempts_school_manual_verifier_fk",
      }),
      check(
        "attendance_attempts_terminal_request_id_check",
        sql`${table.terminalRequestId} ~ '^[A-Za-z0-9_-]{8,64}$'`,
      ),
      check(
        "attendance_attempts_token_hash_format_check",
        sql`${table.scannedTokenHash} ~ '^[0-9a-f]{64}$'`,
      ),
      check(
        "attendance_attempts_face_confidence_check",
        sql`${table.faceConfidenceBps} is null or ${table.faceConfidenceBps} between 0 and 10000`,
      ),
      check(
        "attendance_attempts_liveness_confidence_check",
        sql`${table.livenessConfidenceBps} is null or ${table.livenessConfidenceBps} between 0 and 10000`,
      ),
      check(
        "attendance_attempts_matched_card_identity_check",
        sql`${table.cardResult} <> 'MATCHED' or (${table.studentId} is not null and ${table.cardId} is not null)`,
      ),
      check(
        "attendance_attempts_completed_timestamp_check",
        sql`${table.completedAt} is null or ${table.completedAt} >= ${table.occurredAt}`,
      ),
      check(
        "attendance_attempts_final_outcome_completed_check",
        sql`${table.outcome} = 'PENDING' or ${table.completedAt} is not null`,
      ),
      check(
        "attendance_attempts_manual_review_actor_check",
        sql`${table.outcome} <> 'MANUAL_REVIEW' or ${table.manualVerifiedByMembershipId} is not null`,
      ),
      check(
        "attendance_attempts_operation_time_semantics_check",
        sql`(
          (${table.operation} = 'CHECK_IN' and ${table.departureResult} = 'NOT_RUN')
          or
          (${table.operation} = 'CHECK_OUT' and ${table.timeResult} = 'NOT_RUN')
        )`,
      ),
      check(
        "attendance_attempts_early_departure_actor_check",
        sql`${table.departureResult} <> 'EARLY' or ${table.manualVerifiedByMembershipId} is not null`,
      ),
    ],
  );

export const studentAttendanceRecords =
  pgTable(
    "student_attendance_records",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
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
      terminalId: uuid(
        "terminal_id",
      ),
      cardId: uuid("card_id"),
      sourceAttemptId: uuid(
        "source_attempt_id",
      ),
      status:
        attendanceRecordStatusEnum(
          "status",
        ).notNull(),
      presenceState:
        attendancePresenceStateEnum(
          "presence_state",
        )
          .default("ON_CAMPUS")
          .notNull(),
      departureResult:
        attendanceDepartureResultEnum(
          "departure_result",
        )
          .default("NOT_RUN")
          .notNull(),
      checkedOutAt: timestamp(
        "checked_out_at",
        {
          withTimezone: true,
        },
      ),
      checkOutAttemptId: uuid(
        "check_out_attempt_id",
      ),
      checkOutTerminalId: uuid(
        "check_out_terminal_id",
      ),
      checkOutCardId: uuid(
        "check_out_card_id",
      ),
      checkOutVerifiedByMembershipId:
        uuid(
          "check_out_verified_by_membership_id",
        ),
      checkOutReason: varchar(
        "check_out_reason",
        {
          length: 240,
        },
      ),
      verifiedByMembershipId:
        uuid(
          "verified_by_membership_id",
        ),
      recordedAt: timestamp(
        "recorded_at",
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
        "student_attendance_records_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "student_attendance_records_session_student_unique",
      ).on(
        table.schoolId,
        table.sessionId,
        table.studentId,
      ),
      uniqueIndex(
        "student_attendance_records_source_attempt_unique_idx",
      )
        .on(
          table.schoolId,
          table.sourceAttemptId,
        )
        .where(
          sql`${table.sourceAttemptId} is not null`,
        ),
      index(
        "student_attendance_records_student_recorded_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.recordedAt,
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
        name: "student_attendance_records_school_session_fk",
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
        name: "student_attendance_records_school_student_fk",
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
        name: "student_attendance_records_school_terminal_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.cardId,
        ],
        foreignColumns: [
          studentIdentityCards.schoolId,
          studentIdentityCards.id,
        ],
        name: "student_attendance_records_school_card_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.sourceAttemptId,
        ],
        foreignColumns: [
          attendanceVerificationAttempts.schoolId,
          attendanceVerificationAttempts.id,
        ],
        name: "student_attendance_records_school_source_attempt_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.verifiedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "student_attendance_records_school_verifier_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.checkOutAttemptId,
        ],
        foreignColumns: [
          attendanceVerificationAttempts.schoolId,
          attendanceVerificationAttempts.id,
        ],
        name: "student_attendance_records_school_checkout_attempt_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.checkOutTerminalId,
        ],
        foreignColumns: [
          attendanceTerminals.schoolId,
          attendanceTerminals.id,
        ],
        name: "student_attendance_records_school_checkout_terminal_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.checkOutCardId,
        ],
        foreignColumns: [
          studentIdentityCards.schoolId,
          studentIdentityCards.id,
        ],
        name: "student_attendance_records_school_checkout_card_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.checkOutVerifiedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "student_attendance_records_school_checkout_verifier_fk",
      }),
      check(
        "student_attendance_records_manual_verifier_check",
        sql`${table.status} <> 'MANUAL' or ${table.verifiedByMembershipId} is not null`,
      ),
      check(
        "student_attendance_records_presence_state_check",
        sql`(
          (${table.presenceState} = 'ON_CAMPUS' and ${table.checkedOutAt} is null and ${table.departureResult} = 'NOT_RUN')
          or
          (${table.presenceState} = 'SIGNED_OUT' and ${table.checkedOutAt} is not null and ${table.departureResult} <> 'NOT_RUN')
        )`,
      ),
      check(
        "student_attendance_records_checkout_time_check",
        sql`${table.checkedOutAt} is null or ${table.checkedOutAt} >= ${table.recordedAt}`,
      ),
      check(
        "student_attendance_records_early_departure_check",
        sql`${table.departureResult} <> 'EARLY' or (
          ${table.checkOutVerifiedByMembershipId} is not null
          and ${table.checkOutReason} is not null
          and length(trim(${table.checkOutReason})) > 0
        )`,
      ),
    ],
  );

export const studentPresenceEvents =
  pgTable(
    "student_presence_events",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
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
      attemptId: uuid(
        "attempt_id",
      ),
      terminalId: uuid(
        "terminal_id",
      ),
      cardId: uuid(
        "card_id",
      ),
      eventType:
        attendancePresenceEventTypeEnum(
          "event_type",
        ).notNull(),
      departureResult:
        attendanceDepartureResultEnum(
          "departure_result",
        )
          .default("NOT_RUN")
          .notNull(),
      actorMembershipId: uuid(
        "actor_membership_id",
      ),
      reason: varchar("reason", {
        length: 240,
      }),
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
        "student_presence_events_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "student_presence_events_record_type_unique",
      ).on(
        table.schoolId,
        table.attendanceRecordId,
        table.eventType,
      ),
      index(
        "student_presence_events_student_occurred_idx",
      ).on(
        table.schoolId,
        table.studentId,
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
        name: "student_presence_events_school_session_fk",
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
        name: "student_presence_events_school_student_fk",
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
        name: "student_presence_events_school_record_fk",
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
        name: "student_presence_events_school_attempt_fk",
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
        name: "student_presence_events_school_terminal_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.cardId,
        ],
        foreignColumns: [
          studentIdentityCards.schoolId,
          studentIdentityCards.id,
        ],
        name: "student_presence_events_school_card_fk",
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
        name: "student_presence_events_school_actor_fk",
      }),
      check(
        "student_presence_events_departure_semantics_check",
        sql`(
          (${table.eventType} = 'CHECKED_IN' and ${table.departureResult} = 'NOT_RUN')
          or
          (${table.eventType} = 'CHECKED_OUT' and ${table.departureResult} <> 'NOT_RUN')
        )`,
      ),
      check(
        "student_presence_events_early_departure_actor_reason_check",
        sql`${table.departureResult} <> 'EARLY' or (
          ${table.actorMembershipId} is not null
          and ${table.reason} is not null
          and length(trim(${table.reason})) > 0
        )`,
      ),
    ],
  );