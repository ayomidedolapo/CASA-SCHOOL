CREATE TYPE "student_card_replacement_payment_status" AS ENUM('UNPAID', 'PAID');--> statement-breakpoint
CREATE TYPE "student_card_replacement_reason" AS ENUM('LOST', 'DAMAGED');--> statement-breakpoint
ALTER TYPE "student_progression_decision" ADD VALUE 'TRANSITIONED' BEFORE 'RETAINED';--> statement-breakpoint
CREATE TABLE "attendance_early_departure_preauthorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attendance_record_id" uuid NOT NULL,
	"authorized_by_membership_id" uuid NOT NULL,
	"passkey_grant_id" uuid NOT NULL,
	"reason" varchar(240) NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_attempt_id" uuid,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_early_departure_preauthorizations_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_early_departure_preauthorizations_reason_not_blank_check" CHECK (length(trim("reason")) > 0),
	CONSTRAINT "attendance_early_departure_preauthorizations_consumed_pair_check" CHECK (("consumed_attempt_id" is null and "consumed_at" is null) or ("consumed_attempt_id" is not null and "consumed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "attendance_early_departure_authorizations" DROP CONSTRAINT "attendance_early_departure_authorizations_grant_unique";--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "home_branch_id" uuid;--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD COLUMN "count_for_attendance" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD COLUMN "replacement_reason" "student_card_replacement_reason" DEFAULT 'LOST'::"student_card_replacement_reason" NOT NULL;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD COLUMN "payment_status" "student_card_replacement_payment_status" DEFAULT 'UNPAID'::"student_card_replacement_payment_status" NOT NULL;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD COLUMN "paid_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD COLUMN "payment_reference" varchar(120);--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD COLUMN "batch_eligible_on" date;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "admission_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "student_guardians" ALTER COLUMN "receives_notifications" SET DEFAULT false;--> statement-breakpoint
DROP INDEX "student_card_production_jobs_internal_authority_reference_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "student_card_production_jobs_internal_authority_reference_unique" ON "student_card_production_jobs" ("internal_authority_reference") WHERE "internal_authority_reference" is not null;--> statement-breakpoint
CREATE INDEX "students_school_home_branch_status_idx" ON "students" ("school_id","home_branch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardians_one_notification_recipient_per_student_idx" ON "student_guardians" ("school_id","student_id") WHERE "receives_notifications" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_early_departure_preauthorizations_active_student_idx" ON "attendance_early_departure_preauthorizations" ("school_id","session_id","student_id") WHERE "consumed_attempt_id" is null and "revoked_at" is null;--> statement-breakpoint
CREATE INDEX "attendance_early_departure_preauthorizations_student_authorized_idx" ON "attendance_early_departure_preauthorizations" ("school_id","student_id","authorized_at");--> statement-breakpoint
CREATE INDEX "student_card_replacement_cases_payment_batch_idx" ON "student_card_replacement_cases" ("school_id","payment_status","batch_eligible_on");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_preauthorizations" ADD CONSTRAINT "attendance_early_departure_preauthorizations_m6rtY33mcYIv_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_preauthorizations" ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "attendance_sessions"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_preauthorizations" ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_preauthorizations" ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_record_fk" FOREIGN KEY ("school_id","attendance_record_id") REFERENCES "student_attendance_records"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_preauthorizations" ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_actor_fk" FOREIGN KEY ("school_id","authorized_by_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_preauthorizations" ADD CONSTRAINT "attendance_early_departure_preauthorizations_passkey_grant_fk" FOREIGN KEY ("passkey_grant_id") REFERENCES "auth_passkey_step_up_grants"("id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_preauthorizations" ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_consumed_attempt_fk" FOREIGN KEY ("school_id","consumed_attempt_id") REFERENCES "attendance_verification_attempts"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD CONSTRAINT "student_card_replacement_cases_paid_by_fk" FOREIGN KEY ("school_id","paid_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD CONSTRAINT "student_card_replacement_cases_payment_actor_check" CHECK ((
          (
            "payment_status" = 'UNPAID'
            and "paid_at" is null
            and "paid_by_membership_id" is null
            and "payment_reference" is null
            and "batch_eligible_on" is null
          )
          or
          (
            "payment_status" = 'PAID'
            and "paid_at" is not null
            and "paid_by_membership_id" is not null
            and "batch_eligible_on" is not null
          )
        ));--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD CONSTRAINT "student_card_replacement_cases_payment_reference_check" CHECK ("payment_reference" is null or length(trim("payment_reference")) > 0);--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_exit_after_admission_check", ADD CONSTRAINT "students_exit_after_admission_check" CHECK ("admission_date" is null or "exit_date" is null or "exit_date" >= "admission_date");--> statement-breakpoint
ALTER TABLE "student_card_production_jobs" DROP CONSTRAINT "student_card_production_jobs_authority_check", ADD CONSTRAINT "student_card_production_jobs_authority_check" CHECK (
        (
          "production_authority" = 'SCHOOL_MEMBERSHIP'
          and "issued_by_membership_id" is not null
          and "passkey_grant_id" is not null
          and "internal_authority_reference" is null
        )
        or
        (
          "production_authority" = 'SCHOOL_ENROLLMENT_AUTO_ISSUE'
          and "issued_by_membership_id" is not null
          and "passkey_grant_id" is null
          and "internal_authority_reference" is not null
        )
        or
        (
          "production_authority" = 'CASA_INTERNAL_RENEWAL'
          and "issued_by_membership_id" is null
          and "passkey_grant_id" is null
          and "internal_authority_reference" is not null
        )
      );