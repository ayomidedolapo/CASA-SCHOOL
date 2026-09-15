ALTER TABLE "attendance_early_departure_authorizations"
  DROP CONSTRAINT IF EXISTS "attendance_early_departure_authorizations_grant_unique";
--> statement-breakpoint

ALTER TABLE "student_guardians"
  ALTER COLUMN "receives_notifications"
  SET DEFAULT false;
--> statement-breakpoint

WITH ranked AS (
  SELECT
    sg.id,
    row_number() OVER (
      PARTITION BY
        sg.school_id,
        sg.student_id
      ORDER BY
        CASE WHEN sg.is_primary THEN 0 ELSE 1 END,
        sg.created_at ASC,
        sg.id ASC
    ) AS recipient_rank
  FROM student_guardians sg
  WHERE sg.receives_notifications = true
)
UPDATE student_guardians sg
SET
  receives_notifications = false,
  updated_at = now()
FROM ranked
WHERE
  sg.id = ranked.id
  AND ranked.recipient_rank > 1;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS
  "student_guardians_one_notification_recipient_per_student_idx"
ON "student_guardians" ("school_id","student_id")
WHERE "receives_notifications" = true;
--> statement-breakpoint

CREATE TABLE "attendance_early_departure_preauthorizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "school_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "attendance_record_id" uuid NOT NULL,
  "authorized_by_membership_id" uuid NOT NULL,
  "passkey_grant_id" uuid NOT NULL,
  "reason" varchar(240) NOT NULL,
  "authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
  "consumed_attempt_id" uuid,
  "consumed_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attendance_early_departure_preauthorizations_school_id_id_unique"
    UNIQUE("school_id","id"),
  CONSTRAINT "attendance_early_departure_preauthorizations_reason_not_blank_check"
    CHECK (length(trim("reason")) > 0),
  CONSTRAINT "attendance_early_departure_preauthorizations_consumed_pair_check"
    CHECK (
      ("consumed_attempt_id" is null and "consumed_at" is null)
      or
      ("consumed_attempt_id" is not null and "consumed_at" is not null)
    )
);
--> statement-breakpoint

CREATE UNIQUE INDEX
  "attendance_early_departure_preauthorizations_active_student_idx"
ON "attendance_early_departure_preauthorizations"
  ("school_id","session_id","student_id")
WHERE
  "consumed_attempt_id" is null
  and "revoked_at" is null;
--> statement-breakpoint

CREATE INDEX
  "attendance_early_departure_preauthorizations_student_authorized_idx"
ON "attendance_early_departure_preauthorizations"
  ("school_id","student_id","authorized_at");
--> statement-breakpoint

ALTER TABLE "attendance_early_departure_preauthorizations"
  ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_id_schools_id_fkey"
  FOREIGN KEY ("school_id")
  REFERENCES "schools"("id");
--> statement-breakpoint

ALTER TABLE "attendance_early_departure_preauthorizations"
  ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_session_fk"
  FOREIGN KEY ("school_id","session_id")
  REFERENCES "attendance_sessions"("school_id","id");
--> statement-breakpoint

ALTER TABLE "attendance_early_departure_preauthorizations"
  ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_student_fk"
  FOREIGN KEY ("school_id","student_id")
  REFERENCES "students"("school_id","id");
--> statement-breakpoint

ALTER TABLE "attendance_early_departure_preauthorizations"
  ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_record_fk"
  FOREIGN KEY ("school_id","attendance_record_id")
  REFERENCES "student_attendance_records"("school_id","id");
--> statement-breakpoint

ALTER TABLE "attendance_early_departure_preauthorizations"
  ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_actor_fk"
  FOREIGN KEY ("school_id","authorized_by_membership_id")
  REFERENCES "school_memberships"("school_id","id");
--> statement-breakpoint

ALTER TABLE "attendance_early_departure_preauthorizations"
  ADD CONSTRAINT "attendance_early_departure_preauthorizations_passkey_grant_fk"
  FOREIGN KEY ("passkey_grant_id")
  REFERENCES "auth_passkey_step_up_grants"("id");
--> statement-breakpoint

ALTER TABLE "attendance_early_departure_preauthorizations"
  ADD CONSTRAINT "attendance_early_departure_preauthorizations_school_consumed_attempt_fk"
  FOREIGN KEY ("school_id","consumed_attempt_id")
  REFERENCES "attendance_verification_attempts"("school_id","id");
