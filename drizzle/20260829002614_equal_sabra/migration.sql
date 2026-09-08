CREATE TYPE "student_card_production_actor_kind" AS ENUM('SCHOOL_MEMBER', 'CASA_INTERNAL');--> statement-breakpoint
CREATE TYPE "student_card_production_event_type" AS ENUM('CARD_PRODUCTION_READY', 'CARD_PRODUCTION_EXPORTED', 'CARD_PRODUCTION_PRINTED', 'PUBLIC_LINK_ROTATED');--> statement-breakpoint
CREATE TYPE "student_card_production_status" AS ENUM('READY', 'EXPORTED', 'PRINTED');--> statement-breakpoint
CREATE TYPE "student_card_template_status" AS ENUM('DRAFT', 'ACTIVE', 'RETIRED');--> statement-breakpoint
CREATE TABLE "student_card_production_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"actor_kind" "student_card_production_actor_kind" NOT NULL,
	"actor_membership_id" uuid,
	"event_type" "student_card_production_event_type" NOT NULL,
	"reason" varchar(240),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_card_production_events_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_card_production_events_actor_check" CHECK ((
          ("actor_kind" = 'SCHOOL_MEMBER' and "actor_membership_id" is not null)
          or
          ("actor_kind" = 'CASA_INTERNAL' and "actor_membership_id" is null)
        )),
	CONSTRAINT "student_card_production_events_reason_check" CHECK ("reason" is null or length(trim("reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "student_card_production_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"issued_by_membership_id" uuid NOT NULL,
	"passkey_grant_id" uuid NOT NULL,
	"public_access_key" varchar(43) NOT NULL CONSTRAINT "student_card_production_jobs_public_access_key_unique" UNIQUE,
	"public_link_revision" integer DEFAULT 1 NOT NULL,
	"front_artifact_key" text NOT NULL,
	"back_artifact_key" text NOT NULL,
	"preview_artifact_key" text NOT NULL,
	"render_snapshot" jsonb NOT NULL,
	"status" "student_card_production_status" DEFAULT 'READY'::"student_card_production_status" NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exported_at" timestamp with time zone,
	"printed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_card_production_jobs_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_card_production_jobs_school_card_unique" UNIQUE("school_id","card_id"),
	CONSTRAINT "student_card_production_jobs_public_key_format_check" CHECK ("public_access_key" ~ '^[A-Za-z0-9_-]{43}$'),
	CONSTRAINT "student_card_production_jobs_public_revision_check" CHECK ("public_link_revision" >= 1),
	CONSTRAINT "student_card_production_jobs_artifacts_not_blank_check" CHECK (length(trim("front_artifact_key")) > 0 and length(trim("back_artifact_key")) > 0 and length(trim("preview_artifact_key")) > 0),
	CONSTRAINT "student_card_production_jobs_status_dates_check" CHECK ((
          ("status" = 'READY' and "exported_at" is null and "printed_at" is null)
          or
          ("status" = 'EXPORTED' and "exported_at" is not null and "printed_at" is null)
          or
          ("status" = 'PRINTED' and "exported_at" is not null and "printed_at" is not null)
        ))
);
--> statement-breakpoint
CREATE TABLE "student_card_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"version_label" varchar(80) NOT NULL CONSTRAINT "student_card_templates_version_unique" UNIQUE,
	"status" "student_card_template_status" DEFAULT 'DRAFT'::"student_card_template_status" NOT NULL,
	"front_source_key" text NOT NULL,
	"back_source_key" text NOT NULL,
	"layout" jsonb NOT NULL,
	"notes" varchar(240),
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_card_templates_version_not_blank_check" CHECK (length(trim("version_label")) > 0),
	CONSTRAINT "student_card_templates_sources_not_blank_check" CHECK (length(trim("front_source_key")) > 0 and length(trim("back_source_key")) > 0),
	CONSTRAINT "student_card_templates_status_dates_check" CHECK ((
          ("status" = 'DRAFT' and "activated_at" is null and "retired_at" is null)
          or
          ("status" = 'ACTIVE' and "activated_at" is not null and "retired_at" is null)
          or
          ("status" = 'RETIRED' and "activated_at" is not null and "retired_at" is not null)
        ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "student_card_production_events_ready_once_idx" ON "student_card_production_events" ("job_id","event_type") WHERE "event_type" = 'CARD_PRODUCTION_READY';--> statement-breakpoint
CREATE INDEX "student_card_production_events_job_occurred_idx" ON "student_card_production_events" ("school_id","job_id","occurred_at");--> statement-breakpoint
CREATE INDEX "student_card_production_jobs_school_status_queued_idx" ON "student_card_production_jobs" ("school_id","status","queued_at");--> statement-breakpoint
CREATE INDEX "student_card_production_jobs_status_queued_idx" ON "student_card_production_jobs" ("status","queued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "student_card_templates_one_active_idx" ON "student_card_templates" ("status") WHERE "status" = 'ACTIVE';--> statement-breakpoint
ALTER TABLE "student_card_production_events" ADD CONSTRAINT "student_card_production_events_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "student_card_production_events" ADD CONSTRAINT "student_card_production_events_school_job_fk" FOREIGN KEY ("school_id","job_id") REFERENCES "student_card_production_jobs"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_card_production_events" ADD CONSTRAINT "student_card_production_events_school_actor_fk" FOREIGN KEY ("school_id","actor_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_card_production_jobs" ADD CONSTRAINT "student_card_production_jobs_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "student_card_production_jobs" ADD CONSTRAINT "student_card_production_jobs_4MzXb68Qpd9n_fkey" FOREIGN KEY ("template_id") REFERENCES "student_card_templates"("id");--> statement-breakpoint
ALTER TABLE "student_card_production_jobs" ADD CONSTRAINT "student_card_production_jobs_sgVqIYzkybX2_fkey" FOREIGN KEY ("passkey_grant_id") REFERENCES "auth_passkey_step_up_grants"("id");--> statement-breakpoint
ALTER TABLE "student_card_production_jobs" ADD CONSTRAINT "student_card_production_jobs_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_card_production_jobs" ADD CONSTRAINT "student_card_production_jobs_school_card_fk" FOREIGN KEY ("school_id","card_id") REFERENCES "student_identity_cards"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_card_production_jobs" ADD CONSTRAINT "student_card_production_jobs_school_issuer_fk" FOREIGN KEY ("school_id","issued_by_membership_id") REFERENCES "school_memberships"("school_id","id");