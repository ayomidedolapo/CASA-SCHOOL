ALTER TABLE "student_identity_card_events"
ADD COLUMN "actor_kind" varchar(32) DEFAULT 'SCHOOL_MEMBER' NOT NULL;

ALTER TABLE "student_identity_card_events"
ALTER COLUMN "actor_membership_id" DROP NOT NULL;

ALTER TABLE "student_identity_card_events"
ADD CONSTRAINT "student_identity_card_events_actor_authority_check"
CHECK (
  (
    "actor_kind" = 'SCHOOL_MEMBER'
    AND "actor_membership_id" IS NOT NULL
  )
  OR
  (
    "actor_kind" = 'CASA_INTERNAL'
    AND "actor_membership_id" IS NULL
  )
);

CREATE INDEX "student_identity_card_events_actor_created_idx"
ON "student_identity_card_events" (
  "school_id",
  "actor_kind",
  "created_at"
);
