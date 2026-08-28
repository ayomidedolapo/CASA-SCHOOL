CREATE TYPE "student_biometric_profile_event_type" AS ENUM('ENROLLED', 'REENROLLED', 'SUSPENDED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "student_biometric_profile_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"previous_profile_id" uuid,
	"actor_membership_id" uuid NOT NULL,
	"event_type" "student_biometric_profile_event_type" NOT NULL,
	"provider" varchar(80) NOT NULL,
	"provider_subject_ref" varchar(180) NOT NULL,
	"reason" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_biometric_profile_events_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_biometric_profile_events_provider_not_blank_check" CHECK (length(trim("provider")) > 0),
	CONSTRAINT "student_biometric_profile_events_subject_ref_not_blank_check" CHECK (length(trim("provider_subject_ref")) > 0),
	CONSTRAINT "student_biometric_profile_events_reenroll_previous_check" CHECK ("event_type" <> 'REENROLLED' or "previous_profile_id" is not null),
	CONSTRAINT "student_biometric_profile_events_reason_check" CHECK ("reason" is null or length(trim("reason")) > 0)
);
--> statement-breakpoint
CREATE INDEX "student_biometric_profile_events_student_created_idx" ON "student_biometric_profile_events" ("school_id","student_id","created_at");--> statement-breakpoint
ALTER TABLE "student_biometric_profile_events" ADD CONSTRAINT "student_biometric_profile_events_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "student_biometric_profile_events" ADD CONSTRAINT "student_biometric_profile_events_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_biometric_profile_events" ADD CONSTRAINT "student_biometric_profile_events_school_profile_fk" FOREIGN KEY ("school_id","profile_id") REFERENCES "student_biometric_profiles"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_biometric_profile_events" ADD CONSTRAINT "student_biometric_profile_events_school_previous_profile_fk" FOREIGN KEY ("school_id","previous_profile_id") REFERENCES "student_biometric_profiles"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_biometric_profile_events" ADD CONSTRAINT "student_biometric_profile_events_school_actor_fk" FOREIGN KEY ("school_id","actor_membership_id") REFERENCES "school_memberships"("school_id","id");