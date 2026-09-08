CREATE TYPE "school_attendance_lifecycle_event_type" AS ENUM('MARKED_READY', 'ACTIVATED', 'PAUSED', 'RESUMED');--> statement-breakpoint
CREATE TYPE "school_attendance_lifecycle_status" AS ENUM('SETUP', 'READY', 'ACTIVE', 'PAUSED');--> statement-breakpoint
CREATE TYPE "student_card_attendance_exception_verification" AS ENUM('FACE_EXISTING_PROFILE');--> statement-breakpoint
CREATE TYPE "student_card_replacement_case_status" AS ENUM('CARD_REPLACEMENT_PENDING', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "school_attendance_lifecycle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"lifecycle_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"event_type" "school_attendance_lifecycle_event_type" NOT NULL,
	"effective_start_date" date,
	"reason" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_attendance_lifecycle_events_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_attendance_lifecycle_events_reason_check" CHECK ("reason" is null or length(trim("reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "school_attendance_lifecycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL CONSTRAINT "school_attendance_lifecycles_school_unique" UNIQUE,
	"status" "school_attendance_lifecycle_status" DEFAULT 'SETUP'::"school_attendance_lifecycle_status" NOT NULL,
	"effective_start_date" date,
	"ready_at" timestamp with time zone,
	"ready_by_membership_id" uuid,
	"activated_at" timestamp with time zone,
	"activated_by_membership_id" uuid,
	"paused_at" timestamp with time zone,
	"paused_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_attendance_lifecycles_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_attendance_lifecycles_ready_actor_check" CHECK ((
          ("ready_at" is null and "ready_by_membership_id" is null)
          or
          ("ready_at" is not null and "ready_by_membership_id" is not null)
        )),
	CONSTRAINT "school_attendance_lifecycles_activation_actor_check" CHECK ((
          ("activated_at" is null and "activated_by_membership_id" is null)
          or
          ("activated_at" is not null and "activated_by_membership_id" is not null)
        )),
	CONSTRAINT "school_attendance_lifecycles_pause_actor_check" CHECK ((
          ("paused_at" is null and "paused_by_membership_id" is null)
          or
          ("paused_at" is not null and "paused_by_membership_id" is not null)
        )),
	CONSTRAINT "school_attendance_lifecycles_active_effective_date_check" CHECK ("status" not in ('ACTIVE','PAUSED') or "effective_start_date" is not null)
);
--> statement-breakpoint
CREATE TABLE "student_card_attendance_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"attendance_record_id" uuid NOT NULL,
	"verified_by_membership_id" uuid NOT NULL,
	"verification_method" "student_card_attendance_exception_verification" NOT NULL,
	"grace_day_number" integer,
	"replacement_requested" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_card_attendance_exceptions_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_card_attendance_exceptions_case_session_unique" UNIQUE("school_id","case_id","session_id"),
	CONSTRAINT "student_card_attendance_exceptions_student_session_unique" UNIQUE("school_id","student_id","session_id"),
	CONSTRAINT "student_card_attendance_exceptions_grace_snapshot_check" CHECK ((
          (
            "replacement_requested" = true
            and "grace_day_number" is null
          )
          or
          (
            "replacement_requested" = false
            and "grace_day_number" between 1 and 3
          )
        ))
);
--> statement-breakpoint
CREATE TABLE "student_card_replacement_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lost_card_id" uuid NOT NULL,
	"status" "student_card_replacement_case_status" DEFAULT 'CARD_REPLACEMENT_PENDING'::"student_card_replacement_case_status" NOT NULL,
	"reported_lost_on" date NOT NULL,
	"reported_lost_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reported_by_membership_id" uuid NOT NULL,
	"reason" varchar(240),
	"replacement_requested_at" timestamp with time zone,
	"replacement_requested_by_membership_id" uuid,
	"replacement_card_id" uuid,
	"completed_at" timestamp with time zone,
	"completed_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_card_replacement_cases_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_card_replacement_cases_reason_check" CHECK ("reason" is null or length(trim("reason")) > 0),
	CONSTRAINT "student_card_replacement_cases_request_actor_check" CHECK ((
          (
            "replacement_requested_at" is null
            and "replacement_requested_by_membership_id" is null
          )
          or
          (
            "replacement_requested_at" is not null
            and "replacement_requested_by_membership_id" is not null
          )
        )),
	CONSTRAINT "student_card_replacement_cases_completion_actor_check" CHECK ((
          (
            "completed_at" is null
            and "completed_by_membership_id" is null
          )
          or
          (
            "completed_at" is not null
            and "completed_by_membership_id" is not null
          )
        )),
	CONSTRAINT "student_card_replacement_cases_card_difference_check" CHECK ("replacement_card_id" is null or "replacement_card_id" <> "lost_card_id")
);
--> statement-breakpoint
CREATE INDEX "school_attendance_lifecycle_events_lifecycle_created_idx" ON "school_attendance_lifecycle_events" ("school_id","lifecycle_id","created_at");--> statement-breakpoint
CREATE INDEX "school_attendance_lifecycles_status_idx" ON "school_attendance_lifecycles" ("status","effective_start_date");--> statement-breakpoint
CREATE INDEX "student_card_attendance_exceptions_student_created_idx" ON "student_card_attendance_exceptions" ("school_id","student_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_card_replacement_cases_one_pending_per_student_idx" ON "student_card_replacement_cases" ("school_id","student_id") WHERE "status" = 'CARD_REPLACEMENT_PENDING';--> statement-breakpoint
CREATE INDEX "student_card_replacement_cases_school_status_idx" ON "student_card_replacement_cases" ("school_id","status","created_at");--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycle_events" ADD CONSTRAINT "school_attendance_lifecycle_events_lifecycle_fk" FOREIGN KEY ("school_id","lifecycle_id") REFERENCES "school_attendance_lifecycles"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycle_events" ADD CONSTRAINT "school_attendance_lifecycle_events_actor_fk" FOREIGN KEY ("school_id","actor_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles" ADD CONSTRAINT "school_attendance_lifecycles_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles" ADD CONSTRAINT "school_attendance_lifecycles_ready_by_fk" FOREIGN KEY ("school_id","ready_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles" ADD CONSTRAINT "school_attendance_lifecycles_activated_by_fk" FOREIGN KEY ("school_id","activated_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles" ADD CONSTRAINT "school_attendance_lifecycles_paused_by_fk" FOREIGN KEY ("school_id","paused_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_attendance_exceptions" ADD CONSTRAINT "student_card_attendance_exceptions_case_fk" FOREIGN KEY ("school_id","case_id") REFERENCES "student_card_replacement_cases"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_attendance_exceptions" ADD CONSTRAINT "student_card_attendance_exceptions_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_card_attendance_exceptions" ADD CONSTRAINT "student_card_attendance_exceptions_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "attendance_sessions"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_attendance_exceptions" ADD CONSTRAINT "student_card_attendance_exceptions_record_fk" FOREIGN KEY ("school_id","attendance_record_id") REFERENCES "student_attendance_records"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_attendance_exceptions" ADD CONSTRAINT "student_card_attendance_exceptions_verifier_fk" FOREIGN KEY ("school_id","verified_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD CONSTRAINT "student_card_replacement_cases_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD CONSTRAINT "student_card_replacement_cases_lost_card_fk" FOREIGN KEY ("school_id","lost_card_id") REFERENCES "student_identity_cards"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD CONSTRAINT "student_card_replacement_cases_replacement_card_fk" FOREIGN KEY ("school_id","replacement_card_id") REFERENCES "student_identity_cards"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD CONSTRAINT "student_card_replacement_cases_reported_by_fk" FOREIGN KEY ("school_id","reported_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD CONSTRAINT "student_card_replacement_cases_requested_by_fk" FOREIGN KEY ("school_id","replacement_requested_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "student_card_replacement_cases" ADD CONSTRAINT "student_card_replacement_cases_completed_by_fk" FOREIGN KEY ("school_id","completed_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;