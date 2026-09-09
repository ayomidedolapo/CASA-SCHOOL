import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
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
  attendanceSessions,
  studentAttendanceRecords,
} from "./attendance";
import {
  schoolAttendanceLifecycleEventTypeEnum,
  schoolAttendanceLifecycleStatusEnum,
  studentCardAttendanceExceptionVerificationEnum,
  studentCardReplacementCaseStatusEnum,
} from "./attendance-readiness-enums";
import { schools } from "./schools";
import { schoolBranches } from "./school-operations";
import {
  studentIdentityCards,
} from "./student-identity";
import { students } from "./students";
import {
  schoolMemberships,
} from "./users";

export const schoolAttendanceLifecycles =
  pgTable(
    "school_attendance_lifecycles",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
          {
            onDelete: "cascade",
          },
        ),
      status:
        schoolAttendanceLifecycleStatusEnum(
          "status",
        )
          .default("SETUP")
          .notNull(),
      effectiveStartDate:
        date(
          "effective_start_date",
        ),
      readyAt: timestamp(
        "ready_at",
        {
          withTimezone: true,
        },
      ),
      readyByMembershipId:
        uuid(
          "ready_by_membership_id",
        ),
      activatedAt: timestamp(
        "activated_at",
        {
          withTimezone: true,
        },
      ),
      activatedByMembershipId:
        uuid(
          "activated_by_membership_id",
        ),
      pausedAt: timestamp(
        "paused_at",
        {
          withTimezone: true,
        },
      ),
      pausedByMembershipId:
        uuid(
          "paused_by_membership_id",
        ),
      scheduledResumeAt:
        timestamp(
          "scheduled_resume_at",
          { withTimezone: true },
        ),
      scheduledResumeByMembershipId:
        uuid(
          "scheduled_resume_by_membership_id",
        ),
      scheduledResumeReason:
        varchar(
          "scheduled_resume_reason",
          { length: 240 },
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
        "school_attendance_lifecycles_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "school_attendance_lifecycles_school_unique",
      ).on(
        table.schoolId,
      ),
      index(
        "school_attendance_lifecycles_status_idx",
      ).on(
        table.status,
        table.effectiveStartDate,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.readyByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "school_attendance_lifecycles_ready_by_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [
          table.schoolId,
          table.activatedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "school_attendance_lifecycles_activated_by_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [
          table.schoolId,
          table.pausedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "school_attendance_lifecycles_paused_by_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [
          table.schoolId,
          table.scheduledResumeByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "school_attendance_lifecycles_scheduled_resume_by_fk",
      }).onDelete("restrict"),
      check(
        "school_attendance_lifecycles_ready_actor_check",
        sql`(
          (${table.readyAt} is null and ${table.readyByMembershipId} is null)
          or
          (${table.readyAt} is not null and ${table.readyByMembershipId} is not null)
        )`,
      ),
      check(
        "school_attendance_lifecycles_activation_actor_check",
        sql`(
          (${table.activatedAt} is null and ${table.activatedByMembershipId} is null)
          or
          (${table.activatedAt} is not null and ${table.activatedByMembershipId} is not null)
        )`,
      ),
      check(
        "school_attendance_lifecycles_pause_actor_check",
        sql`(
          (${table.pausedAt} is null and ${table.pausedByMembershipId} is null)
          or
          (${table.pausedAt} is not null and ${table.pausedByMembershipId} is not null)
        )`,
      ),
      check(
        "school_attendance_lifecycles_scheduled_resume_actor_check",
        sql`(
          (
            ${table.scheduledResumeAt} is null
            and ${table.scheduledResumeByMembershipId} is null
            and ${table.scheduledResumeReason} is null
          )
          or
          (
            ${table.scheduledResumeAt} is not null
            and ${table.scheduledResumeByMembershipId} is not null
          )
        )`,
      ),
      check(
        "school_attendance_lifecycles_scheduled_resume_status_check",
        sql`${table.scheduledResumeAt} is null or ${table.status} = 'PAUSED'`,
      ),
      check(
        "school_attendance_lifecycles_scheduled_resume_reason_check",
        sql`${table.scheduledResumeReason} is null or length(trim(${table.scheduledResumeReason})) > 0`,
      ),
      check(
        "school_attendance_lifecycles_active_effective_date_check",
        sql`${table.status} not in ('ACTIVE','PAUSED') or ${table.effectiveStartDate} is not null`,
      ),
    ],
  );

export const schoolAttendanceLifecycleEvents =
  pgTable(
    "school_attendance_lifecycle_events",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId:
        uuid(
          "school_id",
        ).notNull(),
      lifecycleId:
        uuid(
          "lifecycle_id",
        ).notNull(),
      actorMembershipId:
        uuid(
          "actor_membership_id",
        ).notNull(),
      eventType:
        schoolAttendanceLifecycleEventTypeEnum(
          "event_type",
        ).notNull(),
      effectiveStartDate:
        date(
          "effective_start_date",
        ),
      scheduledFor:
        timestamp(
          "scheduled_for",
          { withTimezone: true },
        ),
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
        "school_attendance_lifecycle_events_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      index(
        "school_attendance_lifecycle_events_lifecycle_created_idx",
      ).on(
        table.schoolId,
        table.lifecycleId,
        table.createdAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.lifecycleId,
        ],
        foreignColumns: [
          schoolAttendanceLifecycles.schoolId,
          schoolAttendanceLifecycles.id,
        ],
        name:
          "school_attendance_lifecycle_events_lifecycle_fk",
      }).onDelete("cascade"),
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
          "school_attendance_lifecycle_events_actor_fk",
      }).onDelete("restrict"),
      check(
        "school_attendance_lifecycle_events_reason_check",
        sql`${table.reason} is null or length(trim(${table.reason})) > 0`,
      ),
    ],
  );

export const studentCardReplacementCases =
  pgTable(
    "student_card_replacement_cases",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId:
        uuid(
          "school_id",
        ).notNull(),
      studentId:
        uuid(
          "student_id",
        ).notNull(),
      lostCardId:
        uuid(
          "lost_card_id",
        ).notNull(),
      status:
        studentCardReplacementCaseStatusEnum(
          "status",
        )
          .default(
            "CARD_REPLACEMENT_PENDING",
          )
          .notNull(),
      reportedLostOn:
        date(
          "reported_lost_on",
        ).notNull(),
      reportedLostAt:
        timestamp(
          "reported_lost_at",
          {
            withTimezone: true,
          },
        )
          .defaultNow()
          .notNull(),
      reportedByMembershipId:
        uuid(
          "reported_by_membership_id",
        ).notNull(),
      reason: varchar(
        "reason",
        {
          length: 240,
        },
      ),
      replacementRequestedAt:
        timestamp(
          "replacement_requested_at",
          {
            withTimezone: true,
          },
        ),
      replacementRequestedByMembershipId:
        uuid(
          "replacement_requested_by_membership_id",
        ),
      replacementCardId:
        uuid(
          "replacement_card_id",
        ),
      completedAt:
        timestamp(
          "completed_at",
          {
            withTimezone: true,
          },
        ),
      completedByMembershipId:
        uuid(
          "completed_by_membership_id",
        ),
      createdAt:
        timestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .defaultNow()
          .notNull(),
      updatedAt:
        timestamp(
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
        "student_card_replacement_cases_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      uniqueIndex(
        "student_card_replacement_cases_one_pending_per_student_idx",
      )
        .on(
          table.schoolId,
          table.studentId,
        )
        .where(
          sql`${table.status} = 'CARD_REPLACEMENT_PENDING'`,
        ),
      index(
        "student_card_replacement_cases_school_status_idx",
      ).on(
        table.schoolId,
        table.status,
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
        name:
          "student_card_replacement_cases_student_fk",
      }).onDelete("cascade"),
      foreignKey({
        columns: [
          table.schoolId,
          table.lostCardId,
        ],
        foreignColumns: [
          studentIdentityCards.schoolId,
          studentIdentityCards.id,
        ],
        name:
          "student_card_replacement_cases_lost_card_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [
          table.schoolId,
          table.replacementCardId,
        ],
        foreignColumns: [
          studentIdentityCards.schoolId,
          studentIdentityCards.id,
        ],
        name:
          "student_card_replacement_cases_replacement_card_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [
          table.schoolId,
          table.reportedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "student_card_replacement_cases_reported_by_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [
          table.schoolId,
          table.replacementRequestedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "student_card_replacement_cases_requested_by_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [
          table.schoolId,
          table.completedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "student_card_replacement_cases_completed_by_fk",
      }).onDelete("restrict"),
      check(
        "student_card_replacement_cases_reason_check",
        sql`${table.reason} is null or length(trim(${table.reason})) > 0`,
      ),
      check(
        "student_card_replacement_cases_request_actor_check",
        sql`(
          (
            ${table.replacementRequestedAt} is null
            and ${table.replacementRequestedByMembershipId} is null
          )
          or
          (
            ${table.replacementRequestedAt} is not null
            and ${table.replacementRequestedByMembershipId} is not null
          )
        )`,
      ),
      check(
        "student_card_replacement_cases_completion_actor_check",
        sql`(
          (
            ${table.completedAt} is null
            and ${table.completedByMembershipId} is null
          )
          or
          (
            ${table.completedAt} is not null
            and ${table.completedByMembershipId} is not null
          )
        )`,
      ),
      check(
        "student_card_replacement_cases_card_difference_check",
        sql`${table.replacementCardId} is null or ${table.replacementCardId} <> ${table.lostCardId}`,
      ),
    ],
  );

export const studentCardAttendanceExceptions =
  pgTable(
    "student_card_attendance_exceptions",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId:
        uuid(
          "school_id",
        ).notNull(),
      caseId:
        uuid(
          "case_id",
        ).notNull(),
      studentId:
        uuid(
          "student_id",
        ).notNull(),
      sessionId:
        uuid(
          "session_id",
        ).notNull(),
      attendanceRecordId:
        uuid(
          "attendance_record_id",
        ).notNull(),
      verifiedByMembershipId:
        uuid(
          "verified_by_membership_id",
        ).notNull(),
      verificationMethod:
        studentCardAttendanceExceptionVerificationEnum(
          "verification_method",
        ).notNull(),
      graceDayNumber:
        integer(
          "grace_day_number",
        ),
      replacementRequested:
        boolean(
          "replacement_requested",
        )
          .default(false)
          .notNull(),
      createdAt:
        timestamp(
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
        "student_card_attendance_exceptions_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "student_card_attendance_exceptions_case_session_unique",
      ).on(
        table.schoolId,
        table.caseId,
        table.sessionId,
      ),
      unique(
        "student_card_attendance_exceptions_student_session_unique",
      ).on(
        table.schoolId,
        table.studentId,
        table.sessionId,
      ),
      index(
        "student_card_attendance_exceptions_student_created_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.createdAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.caseId,
        ],
        foreignColumns: [
          studentCardReplacementCases.schoolId,
          studentCardReplacementCases.id,
        ],
        name:
          "student_card_attendance_exceptions_case_fk",
      }).onDelete("restrict"),
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
          "student_card_attendance_exceptions_student_fk",
      }).onDelete("cascade"),
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
          "student_card_attendance_exceptions_session_fk",
      }).onDelete("restrict"),
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
          "student_card_attendance_exceptions_record_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [
          table.schoolId,
          table.verifiedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name:
          "student_card_attendance_exceptions_verifier_fk",
      }).onDelete("restrict"),
      check(
        "student_card_attendance_exceptions_grace_snapshot_check",
        sql`(
          (
            ${table.replacementRequested} = true
            and ${table.graceDayNumber} is null
          )
          or
          (
            ${table.replacementRequested} = false
            and ${table.graceDayNumber} between 1 and 3
          )
        )`,
      ),
    ],
  );

export const studentFirstCardAttendanceExceptions =
  pgTable(
    "student_first_card_attendance_exceptions",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull(),
      studentId: uuid("student_id")
        .notNull(),
      pendingCardId: uuid("pending_card_id")
        .notNull(),
      sessionId: uuid("session_id")
        .notNull(),
      attendanceRecordId: uuid("attendance_record_id")
        .notNull(),
      verifiedByMembershipId: uuid(
        "verified_by_membership_id",
      ).notNull(),
      verificationMethod:
        studentCardAttendanceExceptionVerificationEnum(
          "verification_method",
        ).notNull(),
      createdAt: timestamp(
        "created_at",
        { withTimezone: true },
      )
        .defaultNow()
        .notNull(),
    },
    (table) => [
      unique(
        "student_first_card_attendance_exceptions_school_id_id_unique",
      ).on(table.schoolId, table.id),
      unique(
        "student_first_card_attendance_exceptions_student_session_unique",
      ).on(
        table.schoolId,
        table.studentId,
        table.sessionId,
      ),
      unique(
        "student_first_card_attendance_exceptions_card_session_unique",
      ).on(
        table.schoolId,
        table.pendingCardId,
        table.sessionId,
      ),
      index(
        "student_first_card_attendance_exceptions_student_created_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.createdAt,
      ),
      foreignKey({
        columns: [table.schoolId, table.studentId],
        foreignColumns: [students.schoolId, students.id],
        name: "student_first_card_attendance_exceptions_student_fk",
      }).onDelete("cascade"),
      foreignKey({
        columns: [table.schoolId, table.pendingCardId],
        foreignColumns: [
          studentIdentityCards.schoolId,
          studentIdentityCards.id,
        ],
        name: "student_first_card_attendance_exceptions_card_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.schoolId, table.sessionId],
        foreignColumns: [
          attendanceSessions.schoolId,
          attendanceSessions.id,
        ],
        name: "student_first_card_attendance_exceptions_session_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.schoolId, table.attendanceRecordId],
        foreignColumns: [
          studentAttendanceRecords.schoolId,
          studentAttendanceRecords.id,
        ],
        name: "student_first_card_attendance_exceptions_record_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.schoolId, table.verifiedByMembershipId],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "student_first_card_attendance_exceptions_verifier_fk",
      }).onDelete("restrict"),
    ],
  );

export const studentSupervisedLateArrivals =
  pgTable(
    "student_supervised_late_arrivals",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull(),
      branchId: uuid("branch_id")
        .notNull(),
      studentId: uuid("student_id")
        .notNull(),
      sessionId: uuid("session_id")
        .notNull(),
      attendanceRecordId: uuid("attendance_record_id")
        .notNull(),
      verifiedByMembershipId: uuid(
        "verified_by_membership_id",
      ).notNull(),
      reason: varchar("reason", { length: 240 })
        .notNull(),
      occurredAt: timestamp(
        "occurred_at",
        { withTimezone: true },
      )
        .defaultNow()
        .notNull(),
      createdAt: timestamp(
        "created_at",
        { withTimezone: true },
      )
        .defaultNow()
        .notNull(),
    },
    (table) => [
      unique(
        "student_supervised_late_arrivals_school_id_id_unique",
      ).on(table.schoolId, table.id),
      unique(
        "student_supervised_late_arrivals_student_session_unique",
      ).on(
        table.schoolId,
        table.studentId,
        table.sessionId,
      ),
      index(
        "student_supervised_late_arrivals_branch_occurred_idx",
      ).on(
        table.schoolId,
        table.branchId,
        table.occurredAt,
      ),
      foreignKey({
        columns: [table.schoolId, table.branchId],
        foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
        name: "student_supervised_late_arrivals_branch_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.schoolId, table.studentId],
        foreignColumns: [students.schoolId, students.id],
        name: "student_supervised_late_arrivals_student_fk",
      }).onDelete("cascade"),
      foreignKey({
        columns: [table.schoolId, table.sessionId],
        foreignColumns: [
          attendanceSessions.schoolId,
          attendanceSessions.id,
        ],
        name: "student_supervised_late_arrivals_session_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.schoolId, table.attendanceRecordId],
        foreignColumns: [
          studentAttendanceRecords.schoolId,
          studentAttendanceRecords.id,
        ],
        name: "student_supervised_late_arrivals_record_fk",
      }).onDelete("restrict"),
      foreignKey({
        columns: [table.schoolId, table.verifiedByMembershipId],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "student_supervised_late_arrivals_verifier_fk",
      }).onDelete("restrict"),
      check(
        "student_supervised_late_arrivals_reason_not_blank_check",
        sql`length(trim(${table.reason})) > 0`,
      ),
    ],
  );
