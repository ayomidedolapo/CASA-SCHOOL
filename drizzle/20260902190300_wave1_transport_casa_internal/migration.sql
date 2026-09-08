ALTER TABLE "attendance_policies"
ADD COLUMN IF NOT EXISTS "school_bus_grace_minutes" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "attendance_policies"
ADD COLUMN IF NOT EXISTS "independent_grace_minutes" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_policies_bus_grace_minutes_check'
  ) THEN
    ALTER TABLE "attendance_policies"
    ADD CONSTRAINT "attendance_policies_bus_grace_minutes_check"
    CHECK ("school_bus_grace_minutes" BETWEEN 0 AND 240);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_policies_independent_grace_minutes_check'
  ) THEN
    ALTER TABLE "attendance_policies"
    ADD CONSTRAINT "attendance_policies_independent_grace_minutes_check"
    CHECK ("independent_grace_minutes" BETWEEN 0 AND 240);
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_arrival_method_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "arrival_method" varchar(24) NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "assigned_by_membership_id" uuid,
  "reason" varchar(240),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "student_arrival_method_assignments_school_id_id_unique"
    UNIQUE ("school_id", "id"),
  CONSTRAINT "student_arrival_method_assignments_student_start_unique"
    UNIQUE ("school_id", "student_id", "effective_from"),
  CONSTRAINT "student_arrival_method_assignments_method_check"
    CHECK ("arrival_method" IN ('SCHOOL_BUS', 'INDEPENDENT')),
  CONSTRAINT "student_arrival_method_assignments_dates_check"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  CONSTRAINT "student_arrival_method_assignments_reason_check"
    CHECK ("reason" IS NULL OR length(trim("reason")) > 0)
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_arrival_method_assignments_school_id_schools_id_fkey'
  ) THEN
    ALTER TABLE "student_arrival_method_assignments"
    ADD CONSTRAINT "student_arrival_method_assignments_school_id_schools_id_fkey"
    FOREIGN KEY ("school_id")
    REFERENCES "schools"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_arrival_method_assignments_school_student_fk'
  ) THEN
    ALTER TABLE "student_arrival_method_assignments"
    ADD CONSTRAINT "student_arrival_method_assignments_school_student_fk"
    FOREIGN KEY ("school_id", "student_id")
    REFERENCES "students"("school_id", "id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_arrival_method_assignments_school_actor_fk'
  ) THEN
    ALTER TABLE "student_arrival_method_assignments"
    ADD CONSTRAINT "student_arrival_method_assignments_school_actor_fk"
    FOREIGN KEY ("school_id", "assigned_by_membership_id")
    REFERENCES "school_memberships"("school_id", "id");
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_arrival_method_assignments_student_effective_idx"
ON "student_arrival_method_assignments" (
  "school_id",
  "student_id",
  "effective_from" DESC
);
--> statement-breakpoint
INSERT INTO "student_arrival_method_assignments" (
  "school_id",
  "student_id",
  "arrival_method",
  "effective_from",
  "effective_to",
  "assigned_by_membership_id",
  "reason",
  "created_at",
  "updated_at"
)
SELECT
  student."school_id",
  student."id",
  'INDEPENDENT',
  student."admission_date",
  NULL,
  NULL,
  'SYSTEM_MIGRATION_DEFAULT',
  now(),
  now()
FROM "students" student
WHERE NOT EXISTS (
  SELECT 1
  FROM "student_arrival_method_assignments" existing
  WHERE
    existing."school_id" = student."school_id"
    AND existing."student_id" = student."id"
);
--> statement-breakpoint
ALTER TABLE "student_attendance_records"
ADD COLUMN IF NOT EXISTS "official_start_time" time;
--> statement-breakpoint
ALTER TABLE "student_attendance_records"
ADD COLUMN IF NOT EXISTS "actual_arrival_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "student_attendance_records"
ADD COLUMN IF NOT EXISTS "arrival_method" varchar(24);
--> statement-breakpoint
ALTER TABLE "student_attendance_records"
ADD COLUMN IF NOT EXISTS "arrival_method_assignment_id" uuid;
--> statement-breakpoint
ALTER TABLE "student_attendance_records"
ADD COLUMN IF NOT EXISTS "grace_minutes_used" integer;
--> statement-breakpoint
ALTER TABLE "student_attendance_records"
ADD COLUMN IF NOT EXISTS "minutes_after_official_start" integer;
--> statement-breakpoint
ALTER TABLE "student_attendance_records"
ADD COLUMN IF NOT EXISTS "punctuality_outcome" varchar(32);
--> statement-breakpoint
ALTER TABLE "student_attendance_records"
ADD COLUMN IF NOT EXISTS "punctuality_policy_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_attendance_records_arrival_method_check'
  ) THEN
    ALTER TABLE "student_attendance_records"
    ADD CONSTRAINT "student_attendance_records_arrival_method_check"
    CHECK (
      "arrival_method" IS NULL
      OR "arrival_method" IN ('SCHOOL_BUS', 'INDEPENDENT')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_attendance_records_grace_minutes_check'
  ) THEN
    ALTER TABLE "student_attendance_records"
    ADD CONSTRAINT "student_attendance_records_grace_minutes_check"
    CHECK ("grace_minutes_used" IS NULL OR "grace_minutes_used" BETWEEN 0 AND 240);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_attendance_records_minutes_after_official_check'
  ) THEN
    ALTER TABLE "student_attendance_records"
    ADD CONSTRAINT "student_attendance_records_minutes_after_official_check"
    CHECK (
      "minutes_after_official_start" IS NULL
      OR "minutes_after_official_start" >= 0
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_attendance_records_punctuality_outcome_check'
  ) THEN
    ALTER TABLE "student_attendance_records"
    ADD CONSTRAINT "student_attendance_records_punctuality_outcome_check"
    CHECK (
      "punctuality_outcome" IS NULL
      OR "punctuality_outcome" IN ('ON_TIME', 'ON_TIME_WITH_GRACE', 'LATE')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_attendance_records_arrival_assignment_fk'
  ) THEN
    ALTER TABLE "student_attendance_records"
    ADD CONSTRAINT "student_attendance_records_arrival_assignment_fk"
    FOREIGN KEY ("school_id", "arrival_method_assignment_id")
    REFERENCES "student_arrival_method_assignments"("school_id", "id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_attendance_records_punctuality_policy_fk'
  ) THEN
    ALTER TABLE "student_attendance_records"
    ADD CONSTRAINT "student_attendance_records_punctuality_policy_fk"
    FOREIGN KEY ("school_id", "punctuality_policy_id")
    REFERENCES "attendance_policies"("school_id", "id");
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "casa_internal_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" varchar(32) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "casa_internal_memberships_user_unique"
    UNIQUE ("user_id"),
  CONSTRAINT "casa_internal_memberships_role_check"
    CHECK ("role" IN ('CASA_SUPER_ADMIN', 'CASA_TEAM')),
  CONSTRAINT "casa_internal_memberships_status_check"
    CHECK ("status" IN ('ACTIVE', 'SUSPENDED'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casa_internal_memberships_user_id_users_id_fkey'
  ) THEN
    ALTER TABLE "casa_internal_memberships"
    ADD CONSTRAINT "casa_internal_memberships_user_id_users_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id");
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "casa_internal_memberships_role_status_idx"
ON "casa_internal_memberships" ("role", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "casa_internal_school_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "membership_id" uuid NOT NULL,
  "school_id" uuid NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'ACTIVE',
  "assigned_by_membership_id" uuid,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "casa_internal_school_assignments_membership_school_unique"
    UNIQUE ("membership_id", "school_id"),
  CONSTRAINT "casa_internal_school_assignments_status_check"
    CHECK ("status" IN ('ACTIVE', 'REVOKED'))
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casa_internal_school_assignments_membership_fk'
  ) THEN
    ALTER TABLE "casa_internal_school_assignments"
    ADD CONSTRAINT "casa_internal_school_assignments_membership_fk"
    FOREIGN KEY ("membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casa_internal_school_assignments_school_fk'
  ) THEN
    ALTER TABLE "casa_internal_school_assignments"
    ADD CONSTRAINT "casa_internal_school_assignments_school_fk"
    FOREIGN KEY ("school_id")
    REFERENCES "schools"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casa_internal_school_assignments_assigner_fk'
  ) THEN
    ALTER TABLE "casa_internal_school_assignments"
    ADD CONSTRAINT "casa_internal_school_assignments_assigner_fk"
    FOREIGN KEY ("assigned_by_membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "casa_internal_school_assignments_school_status_idx"
ON "casa_internal_school_assignments" ("school_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "casa_internal_capability_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "membership_id" uuid NOT NULL,
  "capability" varchar(80) NOT NULL,
  "granted_by_membership_id" uuid,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "casa_internal_capability_grants_membership_capability_unique"
    UNIQUE ("membership_id", "capability"),
  CONSTRAINT "casa_internal_capability_grants_capability_not_blank_check"
    CHECK (length(trim("capability")) > 0)
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casa_internal_capability_grants_membership_fk'
  ) THEN
    ALTER TABLE "casa_internal_capability_grants"
    ADD CONSTRAINT "casa_internal_capability_grants_membership_fk"
    FOREIGN KEY ("membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casa_internal_capability_grants_granter_fk'
  ) THEN
    ALTER TABLE "casa_internal_capability_grants"
    ADD CONSTRAINT "casa_internal_capability_grants_granter_fk"
    FOREIGN KEY ("granted_by_membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "casa_internal_onboarding_locks" (
  "school_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "membership_id" uuid NOT NULL,
  "locked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("school_id", "student_id"),
  CONSTRAINT "casa_internal_onboarding_locks_expiry_check"
    CHECK ("expires_at" > "locked_at")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casa_internal_onboarding_locks_school_student_fk'
  ) THEN
    ALTER TABLE "casa_internal_onboarding_locks"
    ADD CONSTRAINT "casa_internal_onboarding_locks_school_student_fk"
    FOREIGN KEY ("school_id", "student_id")
    REFERENCES "students"("school_id", "id")
    ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casa_internal_onboarding_locks_membership_fk'
  ) THEN
    ALTER TABLE "casa_internal_onboarding_locks"
    ADD CONSTRAINT "casa_internal_onboarding_locks_membership_fk"
    FOREIGN KEY ("membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "casa_internal_onboarding_locks_expiry_idx"
ON "casa_internal_onboarding_locks" ("expires_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "casa_internal_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_membership_id" uuid NOT NULL,
  "school_id" uuid,
  "action" varchar(100) NOT NULL,
  "subject_type" varchar(80),
  "subject_id" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "casa_internal_audit_logs_action_not_blank_check"
    CHECK (length(trim("action")) > 0)
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casa_internal_audit_logs_actor_fk'
  ) THEN
    ALTER TABLE "casa_internal_audit_logs"
    ADD CONSTRAINT "casa_internal_audit_logs_actor_fk"
    FOREIGN KEY ("actor_membership_id")
    REFERENCES "casa_internal_memberships"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'casa_internal_audit_logs_school_fk'
  ) THEN
    ALTER TABLE "casa_internal_audit_logs"
    ADD CONSTRAINT "casa_internal_audit_logs_school_fk"
    FOREIGN KEY ("school_id")
    REFERENCES "schools"("id");
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "casa_internal_audit_logs_actor_created_idx"
ON "casa_internal_audit_logs" ("actor_membership_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "casa_internal_audit_logs_school_created_idx"
ON "casa_internal_audit_logs" ("school_id", "created_at" DESC);
