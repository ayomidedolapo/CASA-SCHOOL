CREATE TYPE "school_branch_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "school_calendar_event_kind" AS ENUM('PUBLIC_HOLIDAY', 'SCHOOL_BREAK', 'BRANCH_CLOSURE', 'SPECIAL_NON_INSTRUCTIONAL_DAY');--> statement-breakpoint
CREATE TYPE "student_attendance_excuse_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "student_card_renewal_batch_status" AS ENUM('PLANNED', 'READY', 'EXPORTED', 'PRINTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "student_card_renewal_reason" AS ENUM('CLASS_CHANGE', 'SESSION_CHANGE', 'CLASS_AND_SESSION_CHANGE');--> statement-breakpoint
CREATE TYPE "student_progression_batch_status" AS ENUM('DRAFT', 'CONFIRMED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "student_progression_decision" AS ENUM('PENDING', 'PROMOTED', 'RETAINED', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN');--> statement-breakpoint
CREATE TABLE "school_branch_admin_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_branch_admin_assignments_unique" UNIQUE("school_id","branch_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "school_branch_class_arms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"class_arm_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_branch_class_arms_one_branch_unique" UNIQUE("school_id","class_arm_id")
);
--> statement-breakpoint
CREATE TABLE "school_branch_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_branch_sections_unique" UNIQUE("school_id","branch_id","section_id")
);
--> statement-breakpoint
CREATE TABLE "school_branch_terminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"terminal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_branch_terminals_one_branch_unique" UNIQUE("school_id","terminal_id")
);
--> statement-breakpoint
CREATE TABLE "school_branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"code" varchar(32) NOT NULL,
	"is_headquarters" boolean DEFAULT false NOT NULL,
	"status" "school_branch_status" DEFAULT 'ACTIVE'::"school_branch_status" NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_branches_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_branches_school_code_unique" UNIQUE("school_id","code"),
	CONSTRAINT "school_branches_school_name_unique" UNIQUE("school_id","name"),
	CONSTRAINT "school_branches_name_not_blank_check" CHECK (length(trim("name")) > 0),
	CONSTRAINT "school_branches_code_not_blank_check" CHECK (length(trim("code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "school_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"branch_id" uuid,
	"academic_session_id" uuid,
	"academic_term_id" uuid,
	"kind" "school_calendar_event_kind" NOT NULL,
	"title" varchar(160) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"notes" text,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_calendar_events_dates_check" CHECK ("ends_on" >= "starts_on"),
	CONSTRAINT "school_calendar_events_title_not_blank_check" CHECK (length(trim("title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "student_attendance_excuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"reason" text NOT NULL,
	"status" "student_attendance_excuse_status" DEFAULT 'ACTIVE'::"student_attendance_excuse_status" NOT NULL,
	"approved_by_membership_id" uuid NOT NULL,
	"revoked_by_membership_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_attendance_excuses_dates_check" CHECK ("ends_on" >= "starts_on"),
	CONSTRAINT "student_attendance_excuses_reason_not_blank_check" CHECK (length(trim("reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "student_card_renewal_batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"target_enrollment_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"section_id" uuid,
	"production_job_id" uuid CONSTRAINT "student_card_renewal_batch_items_production_job_unique" UNIQUE,
	"reason" "student_card_renewal_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_card_renewal_batch_items_batch_student_unique" UNIQUE("batch_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "student_card_renewal_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"target_session_id" uuid NOT NULL,
	"status" "student_card_renewal_batch_status" DEFAULT 'PLANNED'::"student_card_renewal_batch_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_card_renewal_batches_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_card_renewal_batches_school_session_unique" UNIQUE("school_id","target_session_id")
);
--> statement-breakpoint
CREATE TABLE "student_progression_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"source_session_id" uuid NOT NULL,
	"target_session_id" uuid NOT NULL,
	"status" "student_progression_batch_status" DEFAULT 'DRAFT'::"student_progression_batch_status" NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"confirmed_by_membership_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_progression_batches_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_progression_batches_branch_sessions_unique" UNIQUE("school_id","branch_id","source_session_id","target_session_id"),
	CONSTRAINT "student_progression_batches_sessions_differ_check" CHECK ("source_session_id" <> "target_session_id")
);
--> statement-breakpoint
CREATE TABLE "student_progression_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"source_enrollment_id" uuid NOT NULL,
	"target_class_arm_id" uuid,
	"decision" "student_progression_decision" DEFAULT 'PENDING'::"student_progression_decision" NOT NULL,
	"notes" text,
	"updated_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_progression_decisions_batch_student_unique" UNIQUE("batch_id","student_id")
);
--> statement-breakpoint
CREATE INDEX "school_branch_admin_membership_idx" ON "school_branch_admin_assignments" ("school_id","membership_id","is_active");--> statement-breakpoint
CREATE INDEX "school_branch_class_arms_branch_idx" ON "school_branch_class_arms" ("school_id","branch_id");--> statement-breakpoint
CREATE INDEX "school_branch_sections_section_idx" ON "school_branch_sections" ("school_id","section_id");--> statement-breakpoint
CREATE INDEX "school_branch_terminals_branch_idx" ON "school_branch_terminals" ("school_id","branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_branches_one_hq_idx" ON "school_branches" ("school_id") WHERE "is_headquarters" = true;--> statement-breakpoint
CREATE INDEX "school_branches_school_status_idx" ON "school_branches" ("school_id","status");--> statement-breakpoint
CREATE INDEX "school_calendar_events_school_dates_idx" ON "school_calendar_events" ("school_id","starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "school_calendar_events_branch_dates_idx" ON "school_calendar_events" ("school_id","branch_id","starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "student_attendance_excuses_student_dates_idx" ON "student_attendance_excuses" ("school_id","student_id","starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "student_attendance_excuses_branch_status_idx" ON "student_attendance_excuses" ("school_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "student_card_renewal_batch_items_group_idx" ON "student_card_renewal_batch_items" ("school_id","batch_id","branch_id","section_id");--> statement-breakpoint
CREATE INDEX "student_card_renewal_batches_school_status_idx" ON "student_card_renewal_batches" ("school_id","status");--> statement-breakpoint
CREATE INDEX "student_progression_batches_school_status_idx" ON "student_progression_batches" ("school_id","status");--> statement-breakpoint
CREATE INDEX "student_progression_decisions_school_decision_idx" ON "student_progression_decisions" ("school_id","decision");--> statement-breakpoint
ALTER TABLE "school_branch_admin_assignments" ADD CONSTRAINT "school_branch_admin_branch_fk" FOREIGN KEY ("school_id","branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_branch_admin_assignments" ADD CONSTRAINT "school_branch_admin_membership_fk" FOREIGN KEY ("school_id","membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_branch_admin_assignments" ADD CONSTRAINT "school_branch_admin_assigner_fk" FOREIGN KEY ("school_id","assigned_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "school_branch_class_arms" ADD CONSTRAINT "school_branch_class_arms_branch_fk" FOREIGN KEY ("school_id","branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_branch_class_arms" ADD CONSTRAINT "school_branch_class_arms_class_arm_fk" FOREIGN KEY ("school_id","class_arm_id") REFERENCES "class_arms"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_branch_sections" ADD CONSTRAINT "school_branch_sections_branch_fk" FOREIGN KEY ("school_id","branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_branch_sections" ADD CONSTRAINT "school_branch_sections_section_fk" FOREIGN KEY ("school_id","section_id") REFERENCES "school_sections"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_branch_terminals" ADD CONSTRAINT "school_branch_terminals_branch_fk" FOREIGN KEY ("school_id","branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_branch_terminals" ADD CONSTRAINT "school_branch_terminals_terminal_fk" FOREIGN KEY ("school_id","terminal_id") REFERENCES "attendance_terminals"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_branches" ADD CONSTRAINT "school_branches_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_calendar_events" ADD CONSTRAINT "school_calendar_events_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_calendar_events" ADD CONSTRAINT "school_calendar_events_branch_fk" FOREIGN KEY ("school_id","branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_calendar_events" ADD CONSTRAINT "school_calendar_events_session_fk" FOREIGN KEY ("school_id","academic_session_id") REFERENCES "academic_sessions"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_calendar_events" ADD CONSTRAINT "school_calendar_events_term_fk" FOREIGN KEY ("school_id","academic_term_id") REFERENCES "academic_terms"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_calendar_events" ADD CONSTRAINT "school_calendar_events_creator_fk" FOREIGN KEY ("school_id","created_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_attendance_excuses" ADD CONSTRAINT "student_attendance_excuses_branch_fk" FOREIGN KEY ("school_id","branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_attendance_excuses" ADD CONSTRAINT "student_attendance_excuses_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_attendance_excuses" ADD CONSTRAINT "student_attendance_excuses_approver_fk" FOREIGN KEY ("school_id","approved_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_attendance_excuses" ADD CONSTRAINT "student_attendance_excuses_revoker_fk" FOREIGN KEY ("school_id","revoked_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_renewal_batch_items" ADD CONSTRAINT "student_card_renewal_items_batch_fk" FOREIGN KEY ("school_id","batch_id") REFERENCES "student_card_renewal_batches"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_card_renewal_batch_items" ADD CONSTRAINT "student_card_renewal_items_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_card_renewal_batch_items" ADD CONSTRAINT "student_card_renewal_items_enrollment_fk" FOREIGN KEY ("school_id","target_enrollment_id") REFERENCES "student_enrollments"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_renewal_batch_items" ADD CONSTRAINT "student_card_renewal_items_branch_fk" FOREIGN KEY ("school_id","branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_renewal_batch_items" ADD CONSTRAINT "student_card_renewal_items_section_fk" FOREIGN KEY ("school_id","section_id") REFERENCES "school_sections"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_renewal_batch_items" ADD CONSTRAINT "student_card_renewal_items_production_job_fk" FOREIGN KEY ("school_id","production_job_id") REFERENCES "student_card_production_jobs"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_renewal_batches" ADD CONSTRAINT "student_card_renewal_batches_session_fk" FOREIGN KEY ("school_id","target_session_id") REFERENCES "academic_sessions"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_progression_batches" ADD CONSTRAINT "student_progression_batches_branch_fk" FOREIGN KEY ("school_id","branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_progression_batches" ADD CONSTRAINT "student_progression_batches_source_session_fk" FOREIGN KEY ("school_id","source_session_id") REFERENCES "academic_sessions"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_progression_batches" ADD CONSTRAINT "student_progression_batches_target_session_fk" FOREIGN KEY ("school_id","target_session_id") REFERENCES "academic_sessions"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_progression_batches" ADD CONSTRAINT "student_progression_batches_creator_fk" FOREIGN KEY ("school_id","created_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_progression_batches" ADD CONSTRAINT "student_progression_batches_confirmer_fk" FOREIGN KEY ("school_id","confirmed_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_progression_decisions" ADD CONSTRAINT "student_progression_decisions_batch_fk" FOREIGN KEY ("school_id","batch_id") REFERENCES "student_progression_batches"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_progression_decisions" ADD CONSTRAINT "student_progression_decisions_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_progression_decisions" ADD CONSTRAINT "student_progression_decisions_source_enrollment_fk" FOREIGN KEY ("school_id","source_enrollment_id") REFERENCES "student_enrollments"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_progression_decisions" ADD CONSTRAINT "student_progression_decisions_target_class_arm_fk" FOREIGN KEY ("school_id","target_class_arm_id") REFERENCES "class_arms"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_progression_decisions" ADD CONSTRAINT "student_progression_decisions_updater_fk" FOREIGN KEY ("school_id","updated_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;

-- CASA migration17 default Main Campus backfill

insert into "school_branches" (
  "id",
  "school_id",
  "name",
  "code",
  "is_headquarters",
  "status",
  "created_at",
  "updated_at"
)
select
  gen_random_uuid(),
  s."id",
  'Main Campus',
  'MAIN',
  true,
  'ACTIVE'::"school_branch_status",
  now(),
  now()
from "schools" s
where not exists (
  select 1
  from "school_branches" b
  where b."school_id" = s."id"
);

insert into "school_branch_sections" (
  "id",
  "school_id",
  "branch_id",
  "section_id",
  "created_at"
)
select
  gen_random_uuid(),
  section."school_id",
  branch."id",
  section."id",
  now()
from "school_sections" section
join "school_branches" branch
  on branch."school_id" =
     section."school_id"
 and branch."is_headquarters" =
     true
on conflict do nothing;

insert into "school_branch_class_arms" (
  "id",
  "school_id",
  "branch_id",
  "class_arm_id",
  "created_at"
)
select
  gen_random_uuid(),
  arm."school_id",
  branch."id",
  arm."id",
  now()
from "class_arms" arm
join "school_branches" branch
  on branch."school_id" =
     arm."school_id"
 and branch."is_headquarters" =
     true
on conflict do nothing;

insert into "school_branch_terminals" (
  "id",
  "school_id",
  "branch_id",
  "terminal_id",
  "created_at"
)
select
  gen_random_uuid(),
  terminal."school_id",
  branch."id",
  terminal."id",
  now()
from "attendance_terminals" terminal
join "school_branches" branch
  on branch."school_id" =
     terminal."school_id"
 and branch."is_headquarters" =
     true
on conflict do nothing;
