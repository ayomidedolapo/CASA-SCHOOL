ALTER TABLE "student_card_production_jobs" DROP CONSTRAINT "student_card_production_jobs_authority_check", ADD CONSTRAINT "student_card_production_jobs_authority_check" CHECK (
        (
          "production_authority" = 'SCHOOL_MEMBERSHIP'
          and "issued_by_membership_id" is not null
          and "passkey_grant_id" is not null
          and "internal_authority_reference" is null
        )
        or
        (
          "production_authority" = 'SCHOOL_ENROLLMENT_AUTO_ISSUE'
          and "issued_by_membership_id" is not null
          and "passkey_grant_id" is null
          and "internal_authority_reference" is not null
        )
                or
        (
          "production_authority" = 'CASA_INTERNAL_RENEWAL'
          and "issued_by_membership_id" is null
          and "passkey_grant_id" is null
          and "internal_authority_reference" is not null
        )
        or
        (
          "production_authority" = 'CASA_INTERNAL_REPLACEMENT'
          and "issued_by_membership_id" is null
          and "passkey_grant_id" is null
          and "internal_authority_reference" is not null
        )
      );