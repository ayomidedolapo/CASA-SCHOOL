CREATE TABLE "attendance_session_policy_rebinds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"from_policy_id" uuid NOT NULL,
	"to_policy_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"passkey_grant_id" uuid NOT NULL CONSTRAINT "attendance_session_policy_rebinds_passkey_grant_unique" UNIQUE,
	"reason" varchar(240) NOT NULL,
	"rebound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_session_policy_rebinds_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "attendance_session_policy_rebinds_reason_not_blank_check" CHECK (length(trim("reason")) > 0),
	CONSTRAINT "attendance_session_policy_rebinds_policy_changed_check" CHECK ("from_policy_id" <> "to_policy_id")
);
--> statement-breakpoint
CREATE INDEX "attendance_session_policy_rebinds_session_rebound_idx" ON "attendance_session_policy_rebinds" ("school_id","session_id","rebound_at");--> statement-breakpoint
ALTER TABLE "attendance_session_policy_rebinds" ADD CONSTRAINT "attendance_session_policy_rebinds_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "attendance_session_policy_rebinds" ADD CONSTRAINT "attendance_session_policy_rebinds_school_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "attendance_sessions"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_session_policy_rebinds" ADD CONSTRAINT "attendance_session_policy_rebinds_school_from_policy_fk" FOREIGN KEY ("school_id","from_policy_id") REFERENCES "attendance_policies"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_session_policy_rebinds" ADD CONSTRAINT "attendance_session_policy_rebinds_school_to_policy_fk" FOREIGN KEY ("school_id","to_policy_id") REFERENCES "attendance_policies"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_session_policy_rebinds" ADD CONSTRAINT "attendance_session_policy_rebinds_school_actor_fk" FOREIGN KEY ("school_id","actor_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_session_policy_rebinds" ADD CONSTRAINT "attendance_session_policy_rebinds_passkey_grant_fk" FOREIGN KEY ("passkey_grant_id") REFERENCES "auth_passkey_step_up_grants"("id");