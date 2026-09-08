ALTER TABLE "student_card_production_jobs"
ADD COLUMN "production_authority" varchar(32) DEFAULT 'SCHOOL_MEMBERSHIP' NOT NULL;

ALTER TABLE "student_card_production_jobs"
ADD COLUMN "internal_authority_reference" uuid;

ALTER TABLE "student_card_production_jobs"
ALTER COLUMN "issued_by_membership_id" DROP NOT NULL;

ALTER TABLE "student_card_production_jobs"
ALTER COLUMN "passkey_grant_id" DROP NOT NULL;

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
    "production_authority" = 'CASA_INTERNAL_RENEWAL'
    AND "issued_by_membership_id" IS NULL
    AND "passkey_grant_id" IS NULL
    AND "internal_authority_reference" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "student_card_production_jobs_internal_authority_reference_unique"
ON "student_card_production_jobs" ("internal_authority_reference")
WHERE "internal_authority_reference" IS NOT NULL;

CREATE INDEX "student_card_production_jobs_authority_status_idx"
ON "student_card_production_jobs" (
  "production_authority",
  "status"
);
