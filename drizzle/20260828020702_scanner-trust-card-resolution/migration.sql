CREATE TYPE "attendance_terminal_event_type" AS ENUM('PROVISIONED', 'SUSPENDED', 'REACTIVATED', 'REVOKED', 'CREDENTIAL_ROTATED');--> statement-breakpoint
CREATE TABLE "attendance_terminal_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"terminal_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"event_type" "attendance_terminal_event_type" NOT NULL,
	"credential_version" integer NOT NULL,
	"reason" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_terminal_events_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_terminal_events_credential_version_check" CHECK ("credential_version" >= 1),
	CONSTRAINT "attendance_terminal_events_reason_check" CHECK ("reason" is null or length(trim("reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "attendance_terminals" ADD COLUMN "credential_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD COLUMN "terminal_request_id" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD CONSTRAINT "attendance_attempts_terminal_request_unique" UNIQUE("school_id","terminal_id","terminal_request_id");--> statement-breakpoint
CREATE INDEX "attendance_terminal_events_terminal_created_idx" ON "attendance_terminal_events" ("school_id","terminal_id","created_at");--> statement-breakpoint
ALTER TABLE "attendance_terminal_events" ADD CONSTRAINT "attendance_terminal_events_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "attendance_terminal_events" ADD CONSTRAINT "attendance_terminal_events_school_terminal_fk" FOREIGN KEY ("school_id","terminal_id") REFERENCES "attendance_terminals"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_terminal_events" ADD CONSTRAINT "attendance_terminal_events_school_actor_fk" FOREIGN KEY ("school_id","actor_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_terminals" ADD CONSTRAINT "attendance_terminals_credential_version_check" CHECK ("credential_version" >= 1);--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD CONSTRAINT "attendance_attempts_terminal_request_id_check" CHECK ("terminal_request_id" ~ '^[A-Za-z0-9_-]{8,64}$');