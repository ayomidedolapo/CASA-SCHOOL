CREATE TYPE "auth_webauthn_challenge_purpose" AS ENUM('REGISTRATION', 'LOGIN', 'STEP_UP');--> statement-breakpoint
CREATE TABLE "auth_passkey_step_up_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"challenge_id" uuid NOT NULL CONSTRAINT "auth_passkey_step_up_grants_challenge_unique" UNIQUE,
	"passkey_id" uuid NOT NULL,
	"action" varchar(80) NOT NULL,
	"token_hash" varchar(64) NOT NULL CONSTRAINT "auth_passkey_step_up_grants_token_hash_unique" UNIQUE,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_passkey_step_up_grants_action_not_blank_check" CHECK (length(trim("action")) > 0),
	CONSTRAINT "auth_passkey_step_up_grants_token_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "auth_passkey_step_up_grants_expiry_check" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
CREATE TABLE "auth_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL CONSTRAINT "auth_passkeys_credential_id_unique" UNIQUE,
	"public_key_base64url" text NOT NULL,
	"webauthn_user_id" varchar(256) NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"device_type" varchar(32) NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" jsonb DEFAULT '[]' NOT NULL,
	"label" varchar(120),
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_passkeys_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "auth_passkeys_credential_id_not_blank_check" CHECK (length(trim("credential_id")) > 0),
	CONSTRAINT "auth_passkeys_public_key_not_blank_check" CHECK (length(trim("public_key_base64url")) > 0),
	CONSTRAINT "auth_passkeys_webauthn_user_id_not_blank_check" CHECK (length(trim("webauthn_user_id")) > 0),
	CONSTRAINT "auth_passkeys_counter_nonnegative_check" CHECK ("counter" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth_webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid,
	"school_id" uuid,
	"membership_id" uuid,
	"purpose" "auth_webauthn_challenge_purpose" NOT NULL,
	"challenge" text NOT NULL CONSTRAINT "auth_webauthn_challenges_challenge_unique" UNIQUE,
	"webauthn_user_id" varchar(256),
	"action" varchar(80),
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_webauthn_challenges_challenge_not_blank_check" CHECK (length(trim("challenge")) > 0),
	CONSTRAINT "auth_webauthn_challenges_expiry_check" CHECK ("expires_at" > "created_at"),
	CONSTRAINT "auth_webauthn_challenges_registration_user_check" CHECK ("purpose" <> 'REGISTRATION' or (
          "user_id" is not null
          and "webauthn_user_id" is not null
        )),
	CONSTRAINT "auth_webauthn_challenges_step_up_scope_check" CHECK ("purpose" <> 'STEP_UP' or (
          "user_id" is not null
          and "school_id" is not null
          and "membership_id" is not null
          and "action" is not null
          and length(trim("action")) > 0
        )),
	CONSTRAINT "auth_webauthn_challenges_non_step_up_action_check" CHECK ("purpose" = 'STEP_UP' or "action" is null)
);
--> statement-breakpoint
CREATE INDEX "auth_passkey_step_up_grants_scope_idx" ON "auth_passkey_step_up_grants" ("school_id","membership_id","action","expires_at");--> statement-breakpoint
CREATE INDEX "auth_passkeys_user_active_idx" ON "auth_passkeys" ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "auth_webauthn_challenges_expiry_idx" ON "auth_webauthn_challenges" ("expires_at","used_at");--> statement-breakpoint
CREATE INDEX "auth_webauthn_challenges_user_purpose_idx" ON "auth_webauthn_challenges" ("user_id","purpose","created_at");--> statement-breakpoint
ALTER TABLE "auth_passkey_step_up_grants" ADD CONSTRAINT "auth_passkey_step_up_grants_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_passkey_step_up_grants" ADD CONSTRAINT "auth_passkey_step_up_grants_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_passkey_step_up_grants" ADD CONSTRAINT "auth_passkey_step_up_grants_ngWgtbRTole1_fkey" FOREIGN KEY ("challenge_id") REFERENCES "auth_webauthn_challenges"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_passkey_step_up_grants" ADD CONSTRAINT "auth_passkey_step_up_grants_passkey_id_auth_passkeys_id_fkey" FOREIGN KEY ("passkey_id") REFERENCES "auth_passkeys"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_passkey_step_up_grants" ADD CONSTRAINT "auth_passkey_step_up_grants_school_membership_fk" FOREIGN KEY ("school_id","membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "auth_passkeys" ADD CONSTRAINT "auth_passkeys_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_webauthn_challenges" ADD CONSTRAINT "auth_webauthn_challenges_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_webauthn_challenges" ADD CONSTRAINT "auth_webauthn_challenges_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "auth_webauthn_challenges" ADD CONSTRAINT "auth_webauthn_challenges_school_membership_fk" FOREIGN KEY ("school_id","membership_id") REFERENCES "school_memberships"("school_id","id");