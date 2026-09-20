-- CASA M37 - Post-M36 operational-Staging UAT corrections
-- Bounded UAT correction. No destructive data deletion.

ALTER TABLE "casa_account_setup_tokens"
  DROP CONSTRAINT IF EXISTS "casa_account_setup_tokens_purpose_check";

ALTER TABLE "casa_account_setup_tokens"
  ADD CONSTRAINT "casa_account_setup_tokens_purpose_check"
  CHECK ("purpose" IN ('CASA_INTERNAL','SCHOOL_OWNER','BRANCH_ADMIN'));

ALTER TABLE "guardian_push_enrollment_links"
  ADD COLUMN IF NOT EXISTS "expires_at" timestamptz;

UPDATE "guardian_push_enrollment_links"
SET "expires_at" = "created_at" + interval '48 hours'
WHERE "expires_at" IS NULL;

ALTER TABLE "guardian_push_enrollment_links"
  ALTER COLUMN "expires_at" SET NOT NULL;

ALTER TABLE "guardian_push_enrollment_links"
  DROP CONSTRAINT IF EXISTS "guardian_push_enrollment_links_expiry_check";

ALTER TABLE "guardian_push_enrollment_links"
  ADD CONSTRAINT "guardian_push_enrollment_links_expiry_check"
  CHECK ("expires_at" > "created_at");

-- Notifications are independent per guardian relationship. Every enabled
-- guardian/device may receive FCM; no single-recipient SMS-era uniqueness.
DROP INDEX IF EXISTS "student_guardians_one_notification_recipient_per_student_idx";
