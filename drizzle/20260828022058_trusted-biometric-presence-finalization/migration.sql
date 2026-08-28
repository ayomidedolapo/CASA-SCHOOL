CREATE TYPE "student_biometric_profile_status" AS ENUM('ACTIVE', 'SUSPENDED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "biometric_verification_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"assertion_id" varchar(64) NOT NULL CONSTRAINT "biometric_verification_evidence_assertion_unique" UNIQUE,
	"provider" varchar(80) NOT NULL,
	"provider_verification_id" varchar(180) NOT NULL,
	"face_confidence_bps" integer NOT NULL,
	"liveness_confidence_bps" integer NOT NULL,
	"assertion_issued_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "biometric_verification_evidence_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "biometric_verification_evidence_attempt_unique" UNIQUE("school_id","attempt_id"),
	CONSTRAINT "biometric_verification_evidence_provider_verification_unique" UNIQUE("school_id","provider","provider_verification_id"),
	CONSTRAINT "biometric_verification_evidence_assertion_id_check" CHECK ("assertion_id" ~ '^[A-Za-z0-9_-]{16,64}$'),
	CONSTRAINT "biometric_verification_evidence_provider_not_blank_check" CHECK (length(trim("provider")) > 0),
	CONSTRAINT "biometric_verification_evidence_provider_verification_not_blank_check" CHECK (length(trim("provider_verification_id")) > 0),
	CONSTRAINT "biometric_verification_evidence_face_confidence_check" CHECK ("face_confidence_bps" between 0 and 10000),
	CONSTRAINT "biometric_verification_evidence_liveness_confidence_check" CHECK ("liveness_confidence_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE TABLE "student_biometric_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"provider" varchar(80) NOT NULL,
	"provider_subject_ref" varchar(180) NOT NULL,
	"status" "student_biometric_profile_status" DEFAULT 'ACTIVE'::"student_biometric_profile_status" NOT NULL,
	"enrolled_by_membership_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_biometric_profiles_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_biometric_profiles_provider_subject_unique" UNIQUE("school_id","provider","provider_subject_ref"),
	CONSTRAINT "student_biometric_profiles_provider_not_blank_check" CHECK (length(trim("provider")) > 0),
	CONSTRAINT "student_biometric_profiles_subject_ref_not_blank_check" CHECK (length(trim("provider_subject_ref")) > 0),
	CONSTRAINT "student_biometric_profiles_revoke_timestamp_check" CHECK ("status" <> 'REVOKED' or "revoked_at" is not null)
);
--> statement-breakpoint
CREATE INDEX "biometric_verification_evidence_student_verified_idx" ON "biometric_verification_evidence" ("school_id","student_id","verified_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_biometric_profiles_one_active_per_student_idx" ON "student_biometric_profiles" ("school_id","student_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "student_biometric_profiles_student_status_idx" ON "student_biometric_profiles" ("school_id","student_id","status");--> statement-breakpoint
ALTER TABLE "biometric_verification_evidence" ADD CONSTRAINT "biometric_verification_evidence_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "biometric_verification_evidence" ADD CONSTRAINT "biometric_verification_evidence_school_attempt_fk" FOREIGN KEY ("school_id","attempt_id") REFERENCES "attendance_verification_attempts"("school_id","id");--> statement-breakpoint
ALTER TABLE "biometric_verification_evidence" ADD CONSTRAINT "biometric_verification_evidence_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "biometric_verification_evidence" ADD CONSTRAINT "biometric_verification_evidence_school_profile_fk" FOREIGN KEY ("school_id","profile_id") REFERENCES "student_biometric_profiles"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_biometric_profiles" ADD CONSTRAINT "student_biometric_profiles_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "student_biometric_profiles" ADD CONSTRAINT "student_biometric_profiles_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_biometric_profiles" ADD CONSTRAINT "student_biometric_profiles_school_enroller_fk" FOREIGN KEY ("school_id","enrolled_by_membership_id") REFERENCES "school_memberships"("school_id","id");