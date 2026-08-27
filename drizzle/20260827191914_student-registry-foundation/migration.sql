CREATE TYPE "student_enrollment_status" AS ENUM('ACTIVE', 'COMPLETED', 'WITHDRAWN', 'TRANSFERRED');--> statement-breakpoint
CREATE TYPE "guardian_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "student_identity_card_status" AS ENUM('ACTIVE', 'LOST', 'REVOKED', 'REPLACED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "student_sex" AS ENUM('MALE', 'FEMALE', 'UNSPECIFIED');--> statement-breakpoint
CREATE TYPE "student_status" AS ENUM('ACTIVE', 'INACTIVE', 'GRADUATED', 'WITHDRAWN', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"admission_number" varchar(64) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"middle_name" varchar(100),
	"last_name" varchar(100) NOT NULL,
	"preferred_name" varchar(100),
	"date_of_birth" date NOT NULL,
	"sex" "student_sex" DEFAULT 'UNSPECIFIED'::"student_sex" NOT NULL,
	"status" "student_status" DEFAULT 'ACTIVE'::"student_status" NOT NULL,
	"admission_date" date NOT NULL,
	"exit_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "students_school_admission_number_unique" UNIQUE("school_id","admission_number"),
	CONSTRAINT "students_admission_number_not_blank_check" CHECK (length(trim("admission_number")) > 0),
	CONSTRAINT "students_first_name_not_blank_check" CHECK (length(trim("first_name")) > 0),
	CONSTRAINT "students_last_name_not_blank_check" CHECK (length(trim("last_name")) > 0),
	CONSTRAINT "students_exit_after_admission_check" CHECK ("exit_date" is null or "exit_date" >= "admission_date")
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"membership_id" uuid,
	"full_name" varchar(200) NOT NULL,
	"email" varchar(320),
	"phone" varchar(32),
	"status" "guardian_status" DEFAULT 'ACTIVE'::"guardian_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "guardians_full_name_not_blank_check" CHECK (length(trim("full_name")) > 0),
	CONSTRAINT "guardians_contact_required_check" CHECK ("email" is not null or "phone" is not null),
	CONSTRAINT "guardians_email_normalized_check" CHECK ("email" is null or "email" = lower("email"))
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relationship_label" varchar(80) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_emergency_contact" boolean DEFAULT false NOT NULL,
	"pickup_authorized" boolean DEFAULT false NOT NULL,
	"receives_notifications" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardians_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_guardians_student_guardian_unique" UNIQUE("school_id","student_id","guardian_id"),
	CONSTRAINT "student_guardians_relationship_not_blank_check" CHECK (length(trim("relationship_label")) > 0)
);
--> statement-breakpoint
CREATE TABLE "student_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"class_arm_id" uuid NOT NULL,
	"status" "student_enrollment_status" DEFAULT 'ACTIVE'::"student_enrollment_status" NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_enrollments_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_enrollments_dates_check" CHECK ("ends_on" is null or "ends_on" >= "starts_on"),
	CONSTRAINT "student_enrollments_status_end_date_check" CHECK ((
          ("status" = 'ACTIVE' and "ends_on" is null)
          or
          ("status" <> 'ACTIVE' and "ends_on" is not null)
        ))
);
--> statement-breakpoint
CREATE TABLE "student_identity_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"serial_number" varchar(64) NOT NULL,
	"token_hash" varchar(64) NOT NULL CONSTRAINT "student_identity_cards_token_hash_unique" UNIQUE,
	"status" "student_identity_card_status" DEFAULT 'ACTIVE'::"student_identity_card_status" NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_identity_cards_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_identity_cards_school_serial_unique" UNIQUE("school_id","serial_number"),
	CONSTRAINT "student_identity_cards_serial_not_blank_check" CHECK (length(trim("serial_number")) > 0),
	CONSTRAINT "student_identity_cards_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "student_identity_cards_expiry_after_issue_check" CHECK ("expires_at" is null or "expires_at" > "issued_at")
);
--> statement-breakpoint
CREATE INDEX "students_school_status_idx" ON "students" ("school_id","status");--> statement-breakpoint
CREATE INDEX "students_school_name_idx" ON "students" ("school_id","last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "guardians_school_membership_unique_idx" ON "guardians" ("school_id","membership_id") WHERE "membership_id" is not null;--> statement-breakpoint
CREATE INDEX "guardians_school_status_idx" ON "guardians" ("school_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardians_one_primary_per_student_idx" ON "student_guardians" ("school_id","student_id") WHERE "is_primary" = true;--> statement-breakpoint
CREATE INDEX "student_guardians_guardian_idx" ON "student_guardians" ("school_id","guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_enrollments_one_active_per_student_idx" ON "student_enrollments" ("school_id","student_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "student_enrollments_class_arm_idx" ON "student_enrollments" ("school_id","class_arm_id","status");--> statement-breakpoint
CREATE INDEX "student_enrollments_session_idx" ON "student_enrollments" ("school_id","academic_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_identity_cards_one_active_per_student_idx" ON "student_identity_cards" ("school_id","student_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "student_identity_cards_student_status_idx" ON "student_identity_cards" ("school_id","student_id","status");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_membership_fk" FOREIGN KEY ("school_id","membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_guardian_fk" FOREIGN KEY ("school_id","guardian_id") REFERENCES "guardians"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_session_fk" FOREIGN KEY ("school_id","academic_session_id") REFERENCES "academic_sessions"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_school_class_arm_fk" FOREIGN KEY ("school_id","class_arm_id") REFERENCES "class_arms"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_identity_cards" ADD CONSTRAINT "student_identity_cards_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "student_identity_cards" ADD CONSTRAINT "student_identity_cards_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");