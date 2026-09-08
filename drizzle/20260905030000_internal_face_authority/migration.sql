ALTER TABLE "auth_webauthn_challenges"
ADD COLUMN IF NOT EXISTS "internal_membership_id" uuid;
--> statement-breakpoint
ALTER TABLE "auth_passkey_step_up_grants"
ALTER COLUMN "membership_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_passkey_step_up_grants"
ADD COLUMN IF NOT EXISTS "internal_membership_id" uuid;
--> statement-breakpoint
ALTER TABLE "biometric_liveness_sessions"
ADD COLUMN IF NOT EXISTS "initiated_by_internal_membership_id" uuid;
--> statement-breakpoint
ALTER TABLE "student_biometric_profiles"
ALTER COLUMN "enrolled_by_membership_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "student_biometric_profiles"
ADD COLUMN IF NOT EXISTS "enrolled_by_internal_membership_id" uuid;
--> statement-breakpoint
ALTER TABLE "student_biometric_profile_events"
ALTER COLUMN "actor_membership_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "student_biometric_profile_events"
ADD COLUMN IF NOT EXISTS "actor_internal_membership_id" uuid;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_webauthn_challenges_internal_membership_fk'
  ) THEN
    ALTER TABLE "auth_webauthn_challenges"
    ADD CONSTRAINT "auth_webauthn_challenges_internal_membership_fk"
    FOREIGN KEY ("internal_membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_passkey_step_up_grants_internal_membership_fk'
  ) THEN
    ALTER TABLE "auth_passkey_step_up_grants"
    ADD CONSTRAINT "auth_passkey_step_up_grants_internal_membership_fk"
    FOREIGN KEY ("internal_membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'biometric_liveness_sessions_internal_membership_fk'
  ) THEN
    ALTER TABLE "biometric_liveness_sessions"
    ADD CONSTRAINT "biometric_liveness_sessions_internal_membership_fk"
    FOREIGN KEY ("initiated_by_internal_membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_biometric_profiles_internal_enroller_fk'
  ) THEN
    ALTER TABLE "student_biometric_profiles"
    ADD CONSTRAINT "student_biometric_profiles_internal_enroller_fk"
    FOREIGN KEY ("enrolled_by_internal_membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_biometric_profile_events_internal_actor_fk'
  ) THEN
    ALTER TABLE "student_biometric_profile_events"
    ADD CONSTRAINT "student_biometric_profile_events_internal_actor_fk"
    FOREIGN KEY ("actor_internal_membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "auth_webauthn_challenges"
DROP CONSTRAINT IF EXISTS "auth_webauthn_challenges_step_up_scope_check";
--> statement-breakpoint
ALTER TABLE "auth_webauthn_challenges"
ADD CONSTRAINT "auth_webauthn_challenges_step_up_scope_check"
CHECK (
  "purpose" <> 'STEP_UP'::auth_webauthn_challenge_purpose
  OR (
    "user_id" IS NOT NULL
    AND "school_id" IS NOT NULL
    AND (
      (
        "membership_id" IS NOT NULL
        AND "internal_membership_id" IS NULL
      )
      OR
      (
        "membership_id" IS NULL
        AND "internal_membership_id" IS NOT NULL
      )
    )
    AND "action" IS NOT NULL
    AND length(trim("action")) > 0
  )
);
--> statement-breakpoint
ALTER TABLE "auth_webauthn_challenges"
ADD CONSTRAINT "auth_webauthn_challenges_non_step_up_internal_membership_check"
CHECK (
  "purpose" = 'STEP_UP'::auth_webauthn_challenge_purpose
  OR "internal_membership_id" IS NULL
);
--> statement-breakpoint

ALTER TABLE "auth_passkey_step_up_grants"
ADD CONSTRAINT "auth_passkey_step_up_grants_actor_scope_check"
CHECK (
  (
    "membership_id" IS NOT NULL
    AND "internal_membership_id" IS NULL
  )
  OR
  (
    "membership_id" IS NULL
    AND "internal_membership_id" IS NOT NULL
  )
);
--> statement-breakpoint

ALTER TABLE "biometric_liveness_sessions"
DROP CONSTRAINT IF EXISTS "biometric_liveness_sessions_scope_check";
--> statement-breakpoint
ALTER TABLE "biometric_liveness_sessions"
ADD CONSTRAINT "biometric_liveness_sessions_scope_check"
CHECK (
  (
    "purpose" = 'ENROLLMENT'::biometric_liveness_purpose
    AND "attempt_id" IS NULL
    AND "terminal_id" IS NULL
    AND (
      (
        "initiated_by_membership_id" IS NOT NULL
        AND "initiated_by_internal_membership_id" IS NULL
      )
      OR
      (
        "initiated_by_membership_id" IS NULL
        AND "initiated_by_internal_membership_id" IS NOT NULL
      )
    )
    AND "authorization_action" IN (
      'BIOMETRIC_ENROLL',
      'BIOMETRIC_REENROLL'
    )
  )
  OR
  (
    "purpose" = 'VERIFICATION'::biometric_liveness_purpose
    AND "attempt_id" IS NOT NULL
    AND "terminal_id" IS NOT NULL
    AND "initiated_by_membership_id" IS NULL
    AND "initiated_by_internal_membership_id" IS NULL
    AND "authorization_action" IS NULL
  )
);
--> statement-breakpoint

ALTER TABLE "student_biometric_profiles"
ADD CONSTRAINT "student_biometric_profiles_enroller_scope_check"
CHECK (
  (
    "enrolled_by_membership_id" IS NOT NULL
    AND "enrolled_by_internal_membership_id" IS NULL
  )
  OR
  (
    "enrolled_by_membership_id" IS NULL
    AND "enrolled_by_internal_membership_id" IS NOT NULL
  )
);
--> statement-breakpoint

ALTER TABLE "student_biometric_profile_events"
ADD CONSTRAINT "student_biometric_profile_events_actor_scope_check"
CHECK (
  (
    "actor_membership_id" IS NOT NULL
    AND "actor_internal_membership_id" IS NULL
  )
  OR
  (
    "actor_membership_id" IS NULL
    AND "actor_internal_membership_id" IS NOT NULL
  )
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "auth_passkey_step_up_grants_internal_scope_idx"
ON "auth_passkey_step_up_grants" (
  "school_id",
  "internal_membership_id",
  "action",
  "expires_at"
)
WHERE "internal_membership_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "biometric_liveness_sessions_internal_actor_idx"
ON "biometric_liveness_sessions" (
  "school_id",
  "initiated_by_internal_membership_id",
  "created_at"
)
WHERE "initiated_by_internal_membership_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_biometric_profile_events_internal_actor_idx"
ON "student_biometric_profile_events" (
  "school_id",
  "actor_internal_membership_id",
  "created_at"
)
WHERE "actor_internal_membership_id" IS NOT NULL;
