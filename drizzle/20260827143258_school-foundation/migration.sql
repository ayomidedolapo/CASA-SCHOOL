CREATE TYPE "academic_period_status" AS ENUM('PLANNED', 'ACTIVE', 'CLOSED');--> statement-breakpoint
CREATE TYPE "school_membership_role" AS ENUM('OWNER', 'ADMIN', 'STAFF', 'GUARDIAN', 'STUDENT');--> statement-breakpoint
CREATE TYPE "school_membership_status" AS ENUM('ACTIVE', 'INVITED', 'SUSPENDED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "school_status" AS ENUM('ACTIVE', 'SUSPENDED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "user_status" AS ENUM('ACTIVE', 'SUSPENDED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" varchar(80) NOT NULL CONSTRAINT "schools_slug_unique" UNIQUE,
	"name" varchar(200) NOT NULL,
	"status" "school_status" DEFAULT 'ACTIVE'::"school_status" NOT NULL,
	"timezone" varchar(64) DEFAULT 'Africa/Lagos' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "schools_name_not_blank_check" CHECK (length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "school_membership_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role" "school_membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_membership_roles_membership_role_unique" UNIQUE("membership_id","role")
);
--> statement-breakpoint
CREATE TABLE "school_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "school_membership_status" DEFAULT 'ACTIVE'::"school_membership_status" NOT NULL,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_memberships_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_memberships_school_user_unique" UNIQUE("school_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"full_name" varchar(200) NOT NULL,
	"email" varchar(320) CONSTRAINT "users_email_unique" UNIQUE,
	"phone" varchar(16) CONSTRAINT "users_phone_unique" UNIQUE,
	"status" "user_status" DEFAULT 'ACTIVE'::"user_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_identity_required_check" CHECK ("email" is not null or "phone" is not null),
	CONSTRAINT "users_full_name_not_blank_check" CHECK (length(trim("full_name")) > 0),
	CONSTRAINT "users_email_normalized_check" CHECK ("email" is null or "email" = lower(trim("email"))),
	CONSTRAINT "users_phone_e164_check" CHECK ("phone" is null or "phone" ~ '^+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE TABLE "academic_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "academic_period_status" DEFAULT 'PLANNED'::"academic_period_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_sessions_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "academic_sessions_school_name_unique" UNIQUE("school_id","name"),
	CONSTRAINT "academic_sessions_date_order_check" CHECK ("ends_on" >= "starts_on"),
	CONSTRAINT "academic_sessions_name_not_blank_check" CHECK (length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "academic_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"position" smallint NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "academic_period_status" DEFAULT 'PLANNED'::"academic_period_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_terms_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "academic_terms_session_position_unique" UNIQUE("academic_session_id","position"),
	CONSTRAINT "academic_terms_session_name_unique" UNIQUE("academic_session_id","name"),
	CONSTRAINT "academic_terms_position_positive_check" CHECK ("position" > 0),
	CONSTRAINT "academic_terms_date_order_check" CHECK ("ends_on" >= "starts_on"),
	CONSTRAINT "academic_terms_name_not_blank_check" CHECK (length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "class_arms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"class_level_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"code" varchar(32),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_arms_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "class_arms_level_name_unique" UNIQUE("class_level_id","name"),
	CONSTRAINT "class_arms_name_not_blank_check" CHECK (length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "class_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"section_id" uuid,
	"name" varchar(100) NOT NULL,
	"code" varchar(32),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_levels_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "class_levels_school_name_unique" UNIQUE("school_id","name"),
	CONSTRAINT "class_levels_name_not_blank_check" CHECK (length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "school_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(32),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_sections_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_sections_school_name_unique" UNIQUE("school_id","name"),
	CONSTRAINT "school_sections_name_not_blank_check" CHECK (length(trim("name")) > 0)
);
--> statement-breakpoint
CREATE INDEX "school_membership_roles_school_role_idx" ON "school_membership_roles" ("school_id","role");--> statement-breakpoint
CREATE INDEX "school_memberships_user_idx" ON "school_memberships" ("user_id");--> statement-breakpoint
CREATE INDEX "school_memberships_school_status_idx" ON "school_memberships" ("school_id","status");--> statement-breakpoint
CREATE INDEX "academic_sessions_school_status_idx" ON "academic_sessions" ("school_id","status");--> statement-breakpoint
CREATE INDEX "academic_terms_school_status_idx" ON "academic_terms" ("school_id","status");--> statement-breakpoint
CREATE INDEX "class_arms_school_active_idx" ON "class_arms" ("school_id","is_active");--> statement-breakpoint
CREATE INDEX "class_levels_school_active_idx" ON "class_levels" ("school_id","is_active");--> statement-breakpoint
CREATE INDEX "school_sections_school_active_idx" ON "school_sections" ("school_id","is_active");--> statement-breakpoint
ALTER TABLE "school_membership_roles" ADD CONSTRAINT "school_membership_roles_school_membership_fk" FOREIGN KEY ("school_id","membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_school_session_fk" FOREIGN KEY ("school_id","academic_session_id") REFERENCES "academic_sessions"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "class_arms" ADD CONSTRAINT "class_arms_school_level_fk" FOREIGN KEY ("school_id","class_level_id") REFERENCES "class_levels"("school_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "class_levels" ADD CONSTRAINT "class_levels_school_section_fk" FOREIGN KEY ("school_id","section_id") REFERENCES "school_sections"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "school_sections" ADD CONSTRAINT "school_sections_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;