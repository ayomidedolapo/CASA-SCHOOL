CREATE TYPE "attendance_attempt_outcome" AS ENUM('PENDING', 'RECORDED', 'REJECTED', 'MANUAL_REVIEW');--> statement-breakpoint
CREATE TYPE "attendance_card_result" AS ENUM('PENDING', 'MATCHED', 'UNKNOWN_CARD', 'INACTIVE_CARD');--> statement-breakpoint
CREATE TYPE "attendance_face_result" AS ENUM('NOT_RUN', 'PASSED', 'FAILED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "attendance_liveness_result" AS ENUM('NOT_RUN', 'PASSED', 'FAILED', 'UNAVAILABLE');--> statement-breakpoint
CREATE TYPE "attendance_record_status" AS ENUM('ON_TIME', 'LATE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "attendance_session_status" AS ENUM('PLANNED', 'OPEN', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "attendance_terminal_status" AS ENUM('ACTIVE', 'SUSPENDED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "attendance_time_result" AS ENUM('NOT_RUN', 'ON_TIME', 'LATE', 'OUTSIDE_WINDOW');--> statement-breakpoint
CREATE TABLE "attendance_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_policies_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_policies_name_not_blank_check" CHECK (length(trim("name")) > 0),
	CONSTRAINT "attendance_policies_valid_dates_check" CHECK ("valid_to" is null or "valid_to" >= "valid_from")
);
--> statement-breakpoint
CREATE TABLE "attendance_policy_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"check_in_opens_at" time NOT NULL,
	"on_time_until" time NOT NULL,
	"check_in_closes_at" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_policy_days_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_policy_days_policy_weekday_unique" UNIQUE("school_id","policy_id","weekday"),
	CONSTRAINT "attendance_policy_days_weekday_check" CHECK ("weekday" between 0 and 6),
	CONSTRAINT "attendance_policy_days_time_order_check" CHECK ("check_in_opens_at" <= "on_time_until" and "on_time_until" <= "check_in_closes_at")
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"status" "attendance_session_status" DEFAULT 'PLANNED'::"attendance_session_status" NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_sessions_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_sessions_school_date_unique" UNIQUE("school_id","attendance_date"),
	CONSTRAINT "attendance_sessions_open_close_order_check" CHECK ("closed_at" is null or ("opened_at" is not null and "closed_at" >= "opened_at")),
	CONSTRAINT "attendance_sessions_status_timestamps_check" CHECK ((
          ("status" = 'PLANNED' and "opened_at" is null and "closed_at" is null)
          or
          ("status" = 'OPEN' and "opened_at" is not null and "closed_at" is null)
          or
          ("status" = 'CLOSED' and "opened_at" is not null and "closed_at" is not null)
          or
          ("status" = 'CANCELLED')
        ))
);
--> statement-breakpoint
CREATE TABLE "attendance_terminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"terminal_code" varchar(64) NOT NULL,
	"secret_hash" varchar(64) NOT NULL CONSTRAINT "attendance_terminals_secret_hash_unique" UNIQUE,
	"status" "attendance_terminal_status" DEFAULT 'ACTIVE'::"attendance_terminal_status" NOT NULL,
	"provisioned_by_membership_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_terminals_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_terminals_school_code_unique" UNIQUE("school_id","terminal_code"),
	CONSTRAINT "attendance_terminals_name_not_blank_check" CHECK (length(trim("name")) > 0),
	CONSTRAINT "attendance_terminals_code_not_blank_check" CHECK (length(trim("terminal_code")) > 0),
	CONSTRAINT "attendance_terminals_secret_hash_format_check" CHECK ("secret_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "attendance_verification_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"terminal_id" uuid NOT NULL,
	"student_id" uuid,
	"card_id" uuid,
	"scanned_token_hash" varchar(64) NOT NULL,
	"card_result" "attendance_card_result" DEFAULT 'PENDING'::"attendance_card_result" NOT NULL,
	"face_result" "attendance_face_result" DEFAULT 'NOT_RUN'::"attendance_face_result" NOT NULL,
	"face_confidence_bps" integer,
	"liveness_result" "attendance_liveness_result" DEFAULT 'NOT_RUN'::"attendance_liveness_result" NOT NULL,
	"liveness_confidence_bps" integer,
	"time_result" "attendance_time_result" DEFAULT 'NOT_RUN'::"attendance_time_result" NOT NULL,
	"outcome" "attendance_attempt_outcome" DEFAULT 'PENDING'::"attendance_attempt_outcome" NOT NULL,
	"reason_code" varchar(80),
	"manual_verified_by_membership_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_verification_attempts_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_attempts_token_hash_format_check" CHECK ("scanned_token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "attendance_attempts_face_confidence_check" CHECK ("face_confidence_bps" is null or "face_confidence_bps" between 0 and 10000),
	CONSTRAINT "attendance_attempts_liveness_confidence_check" CHECK ("liveness_confidence_bps" is null or "liveness_confidence_bps" between 0 and 10000),
	CONSTRAINT "attendance_attempts_matched_card_identity_check" CHECK ("card_result" <> 'MATCHED' or ("student_id" is not null and "card_id" is not null)),
	CONSTRAINT "attendance_attempts_completed_timestamp_check" CHECK ("completed_at" is null or "completed_at" >= "occurred_at"),
	CONSTRAINT "attendance_attempts_final_outcome_completed_check" CHECK ("outcome" = 'PENDING' or "completed_at" is not null),
	CONSTRAINT "attendance_attempts_manual_review_actor_check" CHECK ("outcome" <> 'MANUAL_REVIEW' or "manual_verified_by_membership_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "student_attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"terminal_id" uuid,
	"card_id" uuid,
	"source_attempt_id" uuid,
	"status" "attendance_record_status" NOT NULL,
	"verified_by_membership_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_attendance_records_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_attendance_records_session_student_unique" UNIQUE("school_id","session_id","student_id"),
	CONSTRAINT "student_attendance_records_manual_verifier_check" CHECK ("status" <> 'MANUAL' or "verified_by_membership_id" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_policies_one_default_active_per_school_idx" ON "attendance_policies" ("school_id") WHERE "is_default" = true and "is_active" = true;--> statement-breakpoint
CREATE INDEX "attendance_policies_school_active_idx" ON "attendance_policies" ("school_id","is_active");--> statement-breakpoint
CREATE INDEX "attendance_sessions_school_status_date_idx" ON "attendance_sessions" ("school_id","status","attendance_date");--> statement-breakpoint
CREATE INDEX "attendance_terminals_school_status_idx" ON "attendance_terminals" ("school_id","status");--> statement-breakpoint
CREATE INDEX "attendance_attempts_session_occurred_idx" ON "attendance_verification_attempts" ("school_id","session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "attendance_attempts_student_occurred_idx" ON "attendance_verification_attempts" ("school_id","student_id","occurred_at");--> statement-breakpoint
CREATE INDEX "attendance_attempts_outcome_idx" ON "attendance_verification_attempts" ("school_id","outcome","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_attendance_records_source_attempt_unique_idx" ON "student_attendance_records" ("school_id","source_attempt_id") WHERE "source_attempt_id" is not null;--> statement-breakpoint
CREATE INDEX "student_attendance_records_student_recorded_idx" ON "student_attendance_records" ("school_id","student_id","recorded_at");--> statement-breakpoint
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "attendance_policy_days" ADD CONSTRAINT "attendance_policy_days_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "attendance_policy_days" ADD CONSTRAINT "attendance_policy_days_school_policy_fk" FOREIGN KEY ("school_id","policy_id") REFERENCES "attendance_policies"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_policy_fk" FOREIGN KEY ("school_id","policy_id") REFERENCES "attendance_policies"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_terminals" ADD CONSTRAINT "attendance_terminals_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "attendance_terminals" ADD CONSTRAINT "attendance_terminals_school_provisioner_fk" FOREIGN KEY ("school_id","provisioned_by_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD CONSTRAINT "attendance_verification_attempts_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD CONSTRAINT "attendance_attempts_school_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "attendance_sessions"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD CONSTRAINT "attendance_attempts_school_terminal_fk" FOREIGN KEY ("school_id","terminal_id") REFERENCES "attendance_terminals"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD CONSTRAINT "attendance_attempts_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD CONSTRAINT "attendance_attempts_school_card_fk" FOREIGN KEY ("school_id","card_id") REFERENCES "student_identity_cards"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD CONSTRAINT "attendance_attempts_school_manual_verifier_fk" FOREIGN KEY ("school_id","manual_verified_by_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "attendance_sessions"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_terminal_fk" FOREIGN KEY ("school_id","terminal_id") REFERENCES "attendance_terminals"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_card_fk" FOREIGN KEY ("school_id","card_id") REFERENCES "student_identity_cards"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_source_attempt_fk" FOREIGN KEY ("school_id","source_attempt_id") REFERENCES "attendance_verification_attempts"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_verifier_fk" FOREIGN KEY ("school_id","verified_by_membership_id") REFERENCES "school_memberships"("school_id","id");