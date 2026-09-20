-- CASA M38 - automatic first-card authority and pre-print template propagation
-- Additive authority correction. No destructive data deletion.

ALTER TABLE "student_card_production_jobs"
  DROP CONSTRAINT IF EXISTS "student_card_production_jobs_authority_check";

ALTER TABLE "student_card_production_jobs"
  ADD CONSTRAINT "student_card_production_jobs_authority_check"
  CHECK (
    (
      "production_authority" = 'SCHOOL_MEMBERSHIP'
      AND "issued_by_membership_id" IS NOT NULL
      AND "passkey_grant_id" IS NOT NULL
      AND "internal_authority_reference" IS NULL
    )
    OR
    (
      "production_authority" = 'SCHOOL_ENROLLMENT_AUTO_ISSUE'
      AND "issued_by_membership_id" IS NOT NULL
      AND "passkey_grant_id" IS NULL
      AND "internal_authority_reference" IS NOT NULL
    )
    OR
    (
      "production_authority" = 'CASA_INTERNAL_RENEWAL'
      AND "issued_by_membership_id" IS NULL
      AND "passkey_grant_id" IS NULL
      AND "internal_authority_reference" IS NOT NULL
    )
  );
