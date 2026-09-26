import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  academicSessions,
  academicTerms,
  classArms,
  schoolSections,
} from "./academic";
import { attendanceTerminals } from "./attendance";
import { studentCardProductionJobs } from "./card-production";
import { studentEnrollments } from "./enrollments";
import { schools } from "./schools";
import { students } from "./students";
import { schoolMemberships } from "./users";

export const schoolBranchStatusEnum =
  pgEnum("school_branch_status", [
    "ACTIVE",
    "INACTIVE",
  ]);

export const schoolCalendarEventKindEnum =
  pgEnum("school_calendar_event_kind", [
    "PUBLIC_HOLIDAY",
    "SCHOOL_BREAK",
    "BRANCH_CLOSURE",
    "SPECIAL_NON_INSTRUCTIONAL_DAY",
  ]);

export const studentAttendanceExcuseStatusEnum =
  pgEnum("student_attendance_excuse_status", [
    "ACTIVE",
    "REVOKED",
  ]);

export const studentProgressionBatchStatusEnum =
  pgEnum("student_progression_batch_status", [
    "DRAFT",
    "CONFIRMED",
    "CANCELLED",
  ]);

export const studentProgressionDecisionEnum =
  pgEnum("student_progression_decision", [
    "PENDING",
    "PROMOTED",
    "TRANSITIONED",
    "RETAINED",
    "TRANSFERRED",
    "GRADUATED",
    "WITHDRAWN",
  ]);

export const studentCardRenewalBatchStatusEnum =
  pgEnum("student_card_renewal_batch_status", [
    "PLANNED",
    "READY",
    "EXPORTED",
    "PRINTED",
    "CANCELLED",
  ]);

export const studentCardRenewalReasonEnum =
  pgEnum("student_card_renewal_reason", [
    "CLASS_CHANGE",
    "SESSION_CHANGE",
    "CLASS_AND_SESSION_CHANGE",
  ]);

export const schoolBranches = pgTable(
  "school_branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    isHeadquarters: boolean("is_headquarters").default(false).notNull(),
    status: schoolBranchStatusEnum("status").default("ACTIVE").notNull(),
    address: text("address"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("school_branches_school_id_id_unique").on(table.schoolId, table.id),
    unique("school_branches_school_code_unique").on(table.schoolId, table.code),
    unique("school_branches_school_name_unique").on(table.schoolId, table.name),
    uniqueIndex("school_branches_one_hq_idx")
      .on(table.schoolId)
      .where(sql`${table.isHeadquarters} = true`),
    index("school_branches_school_status_idx").on(table.schoolId, table.status),
    check("school_branches_name_not_blank_check", sql`length(trim(${table.name})) > 0`),
    check("school_branches_code_not_blank_check", sql`length(trim(${table.code})) > 0`),
  ],
);

export const schoolBranchAdminAssignments = pgTable(
  "school_branch_admin_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    assignedByMembershipId: uuid("assigned_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("school_branch_admin_assignments_unique").on(
      table.schoolId,
      table.branchId,
      table.membershipId,
    ),
    index("school_branch_admin_membership_idx").on(
      table.schoolId,
      table.membershipId,
      table.isActive,
    ),
    foreignKey({
      columns: [table.schoolId, table.branchId],
      foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
      name: "school_branch_admin_branch_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.membershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "school_branch_admin_membership_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.assignedByMembershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "school_branch_admin_assigner_fk",
    }).onDelete("restrict"),
  ],
);


export const schoolBranchStaffAssignments = pgTable(
  "school_branch_staff_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    assignedByMembershipId: uuid("assigned_by_membership_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("school_branch_staff_assignments_unique").on(
      table.schoolId,
      table.branchId,
      table.membershipId,
    ),
    index("school_branch_staff_membership_idx").on(
      table.schoolId,
      table.membershipId,
      table.isActive,
    ),
    index("school_branch_staff_branch_idx").on(
      table.schoolId,
      table.branchId,
      table.isActive,
    ),
    foreignKey({
      columns: [table.schoolId, table.branchId],
      foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
      name: "school_branch_staff_branch_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.membershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "school_branch_staff_membership_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.assignedByMembershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "school_branch_staff_assigner_fk",
    }).onDelete("set null"),
  ],
);

export const schoolBranchNotificationBranding = pgTable(
  "school_branch_notification_branding",
  {
    branchId: uuid("branch_id").primaryKey(),
    schoolId: uuid("school_id").notNull(),
    logoObjectKey: varchar("logo_object_key", { length: 500 }),
    logoContentType: varchar("logo_content_type", { length: 100 }),
    updatedByMembershipId: uuid("updated_by_membership_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("school_branch_notification_branding_school_idx").on(
      table.schoolId,
    ),
    foreignKey({
      columns: [table.schoolId, table.branchId],
      foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
      name: "school_branch_notification_branding_branch_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.updatedByMembershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "school_branch_notification_branding_updater_fk",
    }).onDelete("set null"),
    check(
      "school_branch_notification_branding_logo_pair_check",
      sql`(${table.logoObjectKey} is null and ${table.logoContentType} is null) or (${table.logoObjectKey} is not null and ${table.logoContentType} is not null)`,
    ),
  ],
);

export const schoolBranchSections = pgTable(
  "school_branch_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    sectionId: uuid("section_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("school_branch_sections_unique").on(
      table.schoolId,
      table.branchId,
      table.sectionId,
    ),
    index("school_branch_sections_section_idx").on(table.schoolId, table.sectionId),
    foreignKey({
      columns: [table.schoolId, table.branchId],
      foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
      name: "school_branch_sections_branch_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.sectionId],
      foreignColumns: [schoolSections.schoolId, schoolSections.id],
      name: "school_branch_sections_section_fk",
    }).onDelete("cascade"),
  ],
);

export const schoolBranchClassArms = pgTable(
  "school_branch_class_arms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    classArmId: uuid("class_arm_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("school_branch_class_arms_one_branch_unique").on(
      table.schoolId,
      table.classArmId,
    ),
    index("school_branch_class_arms_branch_idx").on(table.schoolId, table.branchId),
    foreignKey({
      columns: [table.schoolId, table.branchId],
      foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
      name: "school_branch_class_arms_branch_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.classArmId],
      foreignColumns: [classArms.schoolId, classArms.id],
      name: "school_branch_class_arms_class_arm_fk",
    }).onDelete("cascade"),
  ],
);

export const schoolBranchTerminals = pgTable(
  "school_branch_terminals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    terminalId: uuid("terminal_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("school_branch_terminals_one_branch_unique").on(
      table.schoolId,
      table.terminalId,
    ),
    index("school_branch_terminals_branch_idx").on(table.schoolId, table.branchId),
    foreignKey({
      columns: [table.schoolId, table.branchId],
      foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
      name: "school_branch_terminals_branch_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.terminalId],
      foreignColumns: [attendanceTerminals.schoolId, attendanceTerminals.id],
      name: "school_branch_terminals_terminal_fk",
    }).onDelete("cascade"),
  ],
);

export const schoolCalendarEvents = pgTable(
  "school_calendar_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id"),
    academicSessionId: uuid("academic_session_id"),
    academicTermId: uuid("academic_term_id"),
    kind: schoolCalendarEventKindEnum("kind").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    notes: text("notes"),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("school_calendar_events_school_dates_idx").on(
      table.schoolId,
      table.startsOn,
      table.endsOn,
    ),
    index("school_calendar_events_branch_dates_idx").on(
      table.schoolId,
      table.branchId,
      table.startsOn,
      table.endsOn,
    ),
    foreignKey({
      columns: [table.schoolId, table.branchId],
      foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
      name: "school_calendar_events_branch_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.academicSessionId],
      foreignColumns: [academicSessions.schoolId, academicSessions.id],
      name: "school_calendar_events_session_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.academicTermId],
      foreignColumns: [academicTerms.schoolId, academicTerms.id],
      name: "school_calendar_events_term_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.createdByMembershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "school_calendar_events_creator_fk",
    }).onDelete("restrict"),
    check("school_calendar_events_dates_check", sql`${table.endsOn} >= ${table.startsOn}`),
    check("school_calendar_events_title_not_blank_check", sql`length(trim(${table.title})) > 0`),
  ],
);

export const studentAttendanceExcuses = pgTable(
  "student_attendance_excuses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    studentId: uuid("student_id").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    reason: text("reason").notNull(),
    status: studentAttendanceExcuseStatusEnum("status").default("ACTIVE").notNull(),
    approvedByMembershipId: uuid("approved_by_membership_id").notNull(),
    revokedByMembershipId: uuid("revoked_by_membership_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("student_attendance_excuses_student_dates_idx").on(
      table.schoolId,
      table.studentId,
      table.startsOn,
      table.endsOn,
    ),
    index("student_attendance_excuses_branch_status_idx").on(
      table.schoolId,
      table.branchId,
      table.status,
    ),
    foreignKey({
      columns: [table.schoolId, table.branchId],
      foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
      name: "student_attendance_excuses_branch_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
      name: "student_attendance_excuses_student_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.approvedByMembershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "student_attendance_excuses_approver_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.schoolId, table.revokedByMembershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "student_attendance_excuses_revoker_fk",
    }).onDelete("restrict"),
    check("student_attendance_excuses_dates_check", sql`${table.endsOn} >= ${table.startsOn}`),
    check("student_attendance_excuses_reason_not_blank_check", sql`length(trim(${table.reason})) > 0`),
  ],
);

export const studentProgressionBatches = pgTable(
  "student_progression_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    sourceSessionId: uuid("source_session_id").notNull(),
    targetSessionId: uuid("target_session_id").notNull(),
    status: studentProgressionBatchStatusEnum("status").default("DRAFT").notNull(),
    createdByMembershipId: uuid("created_by_membership_id").notNull(),
    confirmedByMembershipId: uuid("confirmed_by_membership_id"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("student_progression_batches_school_id_id_unique").on(table.schoolId, table.id),
    unique("student_progression_batches_branch_sessions_unique").on(
      table.schoolId,
      table.branchId,
      table.sourceSessionId,
      table.targetSessionId,
    ),
    index("student_progression_batches_school_status_idx").on(table.schoolId, table.status),
    foreignKey({
      columns: [table.schoolId, table.branchId],
      foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
      name: "student_progression_batches_branch_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.schoolId, table.sourceSessionId],
      foreignColumns: [academicSessions.schoolId, academicSessions.id],
      name: "student_progression_batches_source_session_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.schoolId, table.targetSessionId],
      foreignColumns: [academicSessions.schoolId, academicSessions.id],
      name: "student_progression_batches_target_session_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.schoolId, table.createdByMembershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "student_progression_batches_creator_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.schoolId, table.confirmedByMembershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "student_progression_batches_confirmer_fk",
    }).onDelete("restrict"),
    check("student_progression_batches_sessions_differ_check", sql`${table.sourceSessionId} <> ${table.targetSessionId}`),
  ],
);

export const studentProgressionDecisions = pgTable(
  "student_progression_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    studentId: uuid("student_id").notNull(),
    sourceEnrollmentId: uuid("source_enrollment_id").notNull(),
    targetClassArmId: uuid("target_class_arm_id"),
    decision: studentProgressionDecisionEnum("decision").default("PENDING").notNull(),
    notes: text("notes"),
    updatedByMembershipId: uuid("updated_by_membership_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("student_progression_decisions_batch_student_unique").on(table.batchId, table.studentId),
    index("student_progression_decisions_school_decision_idx").on(table.schoolId, table.decision),
    foreignKey({
      columns: [table.schoolId, table.batchId],
      foreignColumns: [studentProgressionBatches.schoolId, studentProgressionBatches.id],
      name: "student_progression_decisions_batch_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
      name: "student_progression_decisions_student_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.sourceEnrollmentId],
      foreignColumns: [studentEnrollments.schoolId, studentEnrollments.id],
      name: "student_progression_decisions_source_enrollment_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.schoolId, table.targetClassArmId],
      foreignColumns: [classArms.schoolId, classArms.id],
      name: "student_progression_decisions_target_class_arm_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.schoolId, table.updatedByMembershipId],
      foreignColumns: [schoolMemberships.schoolId, schoolMemberships.id],
      name: "student_progression_decisions_updater_fk",
    }).onDelete("restrict"),
  ],
);

export const studentCardRenewalBatches = pgTable(
  "student_card_renewal_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    targetSessionId: uuid("target_session_id").notNull(),
    status: studentCardRenewalBatchStatusEnum("status").default("PLANNED").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("student_card_renewal_batches_school_id_id_unique").on(table.schoolId, table.id),
    unique("student_card_renewal_batches_school_session_unique").on(table.schoolId, table.targetSessionId),
    index("student_card_renewal_batches_school_status_idx").on(table.schoolId, table.status),
    foreignKey({
      columns: [table.schoolId, table.targetSessionId],
      foreignColumns: [academicSessions.schoolId, academicSessions.id],
      name: "student_card_renewal_batches_session_fk",
    }).onDelete("restrict"),
  ],
);

export const studentCardRenewalBatchItems = pgTable(
  "student_card_renewal_batch_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: uuid("school_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    studentId: uuid("student_id").notNull(),
    targetEnrollmentId: uuid("target_enrollment_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    sectionId: uuid("section_id"),
    productionJobId: uuid("production_job_id"),
    reason: studentCardRenewalReasonEnum("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("student_card_renewal_batch_items_batch_student_unique").on(table.batchId, table.studentId),
    unique("student_card_renewal_batch_items_production_job_unique").on(table.productionJobId),
    index("student_card_renewal_batch_items_group_idx").on(
      table.schoolId,
      table.batchId,
      table.branchId,
      table.sectionId,
    ),
    foreignKey({
      columns: [table.schoolId, table.batchId],
      foreignColumns: [studentCardRenewalBatches.schoolId, studentCardRenewalBatches.id],
      name: "student_card_renewal_items_batch_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.studentId],
      foreignColumns: [students.schoolId, students.id],
      name: "student_card_renewal_items_student_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.schoolId, table.targetEnrollmentId],
      foreignColumns: [studentEnrollments.schoolId, studentEnrollments.id],
      name: "student_card_renewal_items_enrollment_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.schoolId, table.branchId],
      foreignColumns: [schoolBranches.schoolId, schoolBranches.id],
      name: "student_card_renewal_items_branch_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.schoolId, table.sectionId],
      foreignColumns: [schoolSections.schoolId, schoolSections.id],
      name: "student_card_renewal_items_section_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.schoolId, table.productionJobId],
      foreignColumns: [studentCardProductionJobs.schoolId, studentCardProductionJobs.id],
      name: "student_card_renewal_items_production_job_fk",
    }).onDelete("restrict"),
  ],
);
