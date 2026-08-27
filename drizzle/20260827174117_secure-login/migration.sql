CREATE TABLE "auth_login_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid,
	"event_type" varchar(40) NOT NULL,
	"reason" varchar(80),
	"identifier_hash" varchar(64) NOT NULL,
	"source_address_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_login_events_identifier_hash_format_check" CHECK ("identifier_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_login_events_source_hash_format_check" CHECK ("source_address_hash" is null or "source_address_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"scope" varchar(32),
	"key_hash" varchar(64),
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"blocked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_rate_limits_pk" PRIMARY KEY("scope","key_hash"),
	CONSTRAINT "auth_rate_limits_key_hash_format_check" CHECK ("key_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_rate_limits_failure_count_check" CHECK ("failure_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "auth_login_events_user_created_idx" ON "auth_login_events" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_login_events_identifier_created_idx" ON "auth_login_events" ("identifier_hash","created_at");--> statement-breakpoint
CREATE INDEX "auth_login_events_type_created_idx" ON "auth_login_events" ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "auth_rate_limits_blocked_idx" ON "auth_rate_limits" ("blocked_until");--> statement-breakpoint
ALTER TABLE "auth_login_events" ADD CONSTRAINT "auth_login_events_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;