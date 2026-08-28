CREATE TYPE "biometric_liveness_purpose" AS ENUM('ENROLLMENT', 'VERIFICATION');--> statement-breakpoint
CREATE TYPE "biometric_liveness_status" AS ENUM('CREATED', 'COMPLETED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "biometric_provider_cleanup_status" AS ENUM('PENDING', 'DONE');--> statement-breakpoint
CREATE TABLE "biometric_liveness_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attempt_id" uuid,
	"terminal_id" uuid,
	"initiated_by_membership_id" uuid,
	"purpose" "biometric_liveness_purpose" NOT NULL,
	"authorization_action" varchar(40),
	"provider" varchar(80) NOT NULL,
	"provider_session_id" varchar(180) NOT NULL,
	"status" "biometric_liveness_status" DEFAULT 'CREATED'::"biometric_liveness_status" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"liveness_confidence_bps" integer,
	"face_similarity_bps" integer,
	"provider_subject_ref" varchar(180),
	"failure_code" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "biometric_liveness_sessions_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "biometric_liveness_sessions_provider_session_unique" UNIQUE("provider","provider_session_id"),
	CONSTRAINT "biometric_liveness_sessions_provider_not_blank_check" CHECK (length(trim("provider")) > 0),
	CONSTRAINT "biometric_liveness_sessions_provider_session_not_blank_check" CHECK (length(trim("provider_session_id")) > 0),
	CONSTRAINT "biometric_liveness_sessions_expiry_check" CHECK ("expires_at" > "created_at"),
	CONSTRAINT "biometric_liveness_sessions_scope_check" CHECK ((
          (
            "purpose" = 'ENROLLMENT'
            and "attempt_id" is null
            and "terminal_id" is null
            and "initiated_by_membership_id" is not null
            and "authorization_action" in (
              'BIOMETRIC_ENROLL',
              'BIOMETRIC_REENROLL'
            )
          )
          or
          (
            "purpose" = 'VERIFICATION'
            and "attempt_id" is not null
            and "terminal_id" is not null
            and "initiated_by_membership_id" is null
            and "authorization_action" is null
          )
        )),
	CONSTRAINT "biometric_liveness_sessions_completed_check" CHECK ("status" <> 'COMPLETED' or "completed_at" is not null),
	CONSTRAINT "biometric_liveness_sessions_liveness_confidence_check" CHECK ("liveness_confidence_bps" is null or "liveness_confidence_bps" between 0 and 10000),
	CONSTRAINT "biometric_liveness_sessions_face_similarity_check" CHECK ("face_similarity_bps" is null or "face_similarity_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "biometric_provider_cleanup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"provider" varchar(80) NOT NULL,
	"collection_ref" varchar(255) NOT NULL,
	"subject_ref" varchar(180) NOT NULL,
	"status" "biometric_provider_cleanup_status" DEFAULT 'PENDING'::"biometric_provider_cleanup_status" NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"last_error" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "biometric_provider_cleanup_jobs_target_unique" UNIQUE("school_id","provider","collection_ref","subject_ref"),
	CONSTRAINT "biometric_provider_cleanup_jobs_provider_not_blank_check" CHECK (length(trim("provider")) > 0),
	CONSTRAINT "biometric_provider_cleanup_jobs_collection_not_blank_check" CHECK (length(trim("collection_ref")) > 0),
	CONSTRAINT "biometric_provider_cleanup_jobs_subject_not_blank_check" CHECK (length(trim("subject_ref")) > 0),
	CONSTRAINT "biometric_provider_cleanup_jobs_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "biometric_provider_cleanup_jobs_done_check" CHECK ("status" <> 'DONE' or "completed_at" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "biometric_liveness_sessions_active_attempt_idx" ON "biometric_liveness_sessions" ("school_id","attempt_id") WHERE "purpose" = 'VERIFICATION' and "status" = 'CREATED';--> statement-breakpoint
CREATE UNIQUE INDEX "biometric_liveness_sessions_active_enrollment_idx" ON "biometric_liveness_sessions" ("school_id","student_id") WHERE "purpose" = 'ENROLLMENT' and "status" = 'CREATED';--> statement-breakpoint
CREATE INDEX "biometric_liveness_sessions_status_expiry_idx" ON "biometric_liveness_sessions" ("status","expires_at");--> statement-breakpoint
CREATE INDEX "biometric_provider_cleanup_jobs_work_idx" ON "biometric_provider_cleanup_jobs" ("status","available_at");--> statement-breakpoint
ALTER TABLE "biometric_liveness_sessions" ADD CONSTRAINT "biometric_liveness_sessions_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "biometric_liveness_sessions" ADD CONSTRAINT "biometric_liveness_sessions_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "biometric_liveness_sessions" ADD CONSTRAINT "biometric_liveness_sessions_school_attempt_fk" FOREIGN KEY ("school_id","attempt_id") REFERENCES "attendance_verification_attempts"("school_id","id");--> statement-breakpoint
ALTER TABLE "biometric_liveness_sessions" ADD CONSTRAINT "biometric_liveness_sessions_school_terminal_fk" FOREIGN KEY ("school_id","terminal_id") REFERENCES "attendance_terminals"("school_id","id");--> statement-breakpoint
ALTER TABLE "biometric_liveness_sessions" ADD CONSTRAINT "biometric_liveness_sessions_school_membership_fk" FOREIGN KEY ("school_id","initiated_by_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "biometric_provider_cleanup_jobs" ADD CONSTRAINT "biometric_provider_cleanup_jobs_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");