ALTER TABLE "schools" ADD COLUMN "initial_card_rollout_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "initial_card_rollout_completed_by_internal_membership_id" uuid;--> statement-breakpoint
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
          "production_authority" = 'CASA_INTERNAL_INITIAL_ROLLOUT'
          and "issued_by_membership_id" is null
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
-- CASA M47 transition. Existing schools created before the aa6d5d3 cutover
-- retain legacy LIVE batching. Schools created after the cutover stay in
-- INITIAL_ROLLOUT until a CASA Super Admin explicitly completes the rollout.
update schools
set
  initial_card_rollout_completed_at =
    '2026-10-01T00:59:43Z'::timestamptz,
  initial_card_rollout_completed_by_internal_membership_id =
    null
where
  initial_card_rollout_completed_at is null
  and created_at <
    '2026-10-01T00:59:43Z'::timestamptz;

-- First-card jobs already scheduled for a school still in INITIAL_ROLLOUT
-- become available to CASA Production immediately when M47 is applied.
update student_card_production_jobs job
set
  queued_at = now(),
  updated_at = now()
where
  job.production_authority =
    'SCHOOL_ENROLLMENT_AUTO_ISSUE'
  and job.status =
    'READY'::student_card_production_status
  and job.queued_at > now()
  and exists (
    select 1
    from schools school
    where
      school.id =
        job.school_id
      and school.initial_card_rollout_completed_at
        is null
  )
  and exists (
    select 1
    from student_identity_cards card
    where
      card.school_id =
        job.school_id
      and card.id =
        job.card_id
      and card.status =
        'READY_FOR_ACTIVATION'::student_identity_card_status
  );