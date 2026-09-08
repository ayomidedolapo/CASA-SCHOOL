CREATE TABLE "school_structure_change_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "branch_id" uuid,
  "actor_kind" varchar(32) NOT NULL,
  "actor_school_membership_id" uuid,
  "actor_casa_membership_id" uuid,
  "event_type" varchar(80) NOT NULL,
  "reason" varchar(240) NOT NULL,
  "before_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "after_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "school_structure_change_events_actor_kind_check"
    CHECK ("actor_kind" IN ('SCHOOL_MEMBERSHIP', 'CASA_INTERNAL')),
  CONSTRAINT "school_structure_change_events_actor_reference_check"
    CHECK (
      (
        "actor_kind" = 'SCHOOL_MEMBERSHIP'
        AND "actor_school_membership_id" IS NOT NULL
        AND "actor_casa_membership_id" IS NULL
      )
      OR
      (
        "actor_kind" = 'CASA_INTERNAL'
        AND "actor_school_membership_id" IS NULL
        AND "actor_casa_membership_id" IS NOT NULL
      )
    ),
  CONSTRAINT "school_structure_change_events_event_type_check"
    CHECK (length(trim("event_type")) > 0),
  CONSTRAINT "school_structure_change_events_reason_check"
    CHECK (length(trim("reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "school_structure_change_events"
  ADD CONSTRAINT "school_structure_change_events_school_fk"
  FOREIGN KEY ("school_id")
  REFERENCES "schools"("id")
  ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "school_structure_change_events"
  ADD CONSTRAINT "school_structure_change_events_branch_fk"
  FOREIGN KEY ("school_id", "branch_id")
  REFERENCES "school_branches"("school_id", "id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "school_structure_change_events"
  ADD CONSTRAINT "school_structure_change_events_school_actor_fk"
  FOREIGN KEY ("school_id", "actor_school_membership_id")
  REFERENCES "school_memberships"("school_id", "id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "school_structure_change_events"
  ADD CONSTRAINT "school_structure_change_events_casa_actor_fk"
  FOREIGN KEY ("actor_casa_membership_id")
  REFERENCES "casa_internal_memberships"("id")
  ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX "school_structure_change_events_school_created_idx"
  ON "school_structure_change_events" ("school_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "school_structure_change_events_branch_created_idx"
  ON "school_structure_change_events" ("school_id", "branch_id", "created_at" DESC);
