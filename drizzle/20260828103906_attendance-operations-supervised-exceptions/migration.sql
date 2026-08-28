CREATE TYPE "attendance_session_event_type" AS ENUM('CREATED', 'OPENED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "attendance_early_departure_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attendance_record_id" uuid NOT NULL,
	"authorized_by_membership_id" uuid NOT NULL,
	"passkey_grant_id" uuid NOT NULL CONSTRAINT "attendance_early_departure_authorizations_grant_unique" UNIQUE,
	"authorization_method" varchar(20) DEFAULT 'PASSKEY' NOT NULL,
	"reason" varchar(240) NOT NULL,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_early_departure_authorizations_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_early_departure_authorizations_attempt_unique" UNIQUE("school_id","attempt_id"),
	CONSTRAINT "attendance_early_departure_authorizations_reason_not_blank_check" CHECK (length(trim("reason")) > 0),
	CONSTRAINT "attendance_early_departure_authorizations_method_check" CHECK ("authorization_method" = 'PASSKEY')
);
--> statement-breakpoint
CREATE TABLE "attendance_session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"event_type" "attendance_session_event_type" NOT NULL,
	"reason" varchar(240),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_session_events_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_session_events_session_type_unique" UNIQUE("school_id","session_id","event_type"),
	CONSTRAINT "attendance_session_events_reason_check" CHECK ("reason" is null or length(trim("reason")) > 0)
);
--> statement-breakpoint
CREATE INDEX "attendance_early_departure_authorizations_student_authorized_idx" ON "attendance_early_departure_authorizations" ("school_id","student_id","authorized_at");--> statement-breakpoint
CREATE INDEX "attendance_session_events_session_occurred_idx" ON "attendance_session_events" ("school_id","session_id","occurred_at");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_authorizations" ADD CONSTRAINT "attendance_early_departure_authorizations_PeRVog0wTorC_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_authorizations" ADD CONSTRAINT "attendance_early_departure_authorizations_school_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "attendance_sessions"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_authorizations" ADD CONSTRAINT "attendance_early_departure_authorizations_school_attempt_fk" FOREIGN KEY ("school_id","attempt_id") REFERENCES "attendance_verification_attempts"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_authorizations" ADD CONSTRAINT "attendance_early_departure_authorizations_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_authorizations" ADD CONSTRAINT "attendance_early_departure_authorizations_school_record_fk" FOREIGN KEY ("school_id","attendance_record_id") REFERENCES "student_attendance_records"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_authorizations" ADD CONSTRAINT "attendance_early_departure_authorizations_school_actor_fk" FOREIGN KEY ("school_id","authorized_by_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_early_departure_authorizations" ADD CONSTRAINT "attendance_early_departure_authorizations_passkey_grant_fk" FOREIGN KEY ("passkey_grant_id") REFERENCES "auth_passkey_step_up_grants"("id");--> statement-breakpoint
ALTER TABLE "attendance_session_events" ADD CONSTRAINT "attendance_session_events_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "attendance_session_events" ADD CONSTRAINT "attendance_session_events_school_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "attendance_sessions"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_session_events" ADD CONSTRAINT "attendance_session_events_school_actor_fk" FOREIGN KEY ("school_id","actor_membership_id") REFERENCES "school_memberships"("school_id","id");