-- CASA M48: explicit initial-rollout confirmation only.
-- Restore only M47's synthetic cutoff LIVE rows to INITIAL_ROLLOUT.
update "schools"
set
  "initial_card_rollout_completed_at" = null,
  "initial_card_rollout_completed_by_internal_membership_id" = null,
  "updated_at" = now()
where
  "initial_card_rollout_completed_at" =
    '2026-10-01T00:59:43Z'::timestamptz
  and "initial_card_rollout_completed_by_internal_membership_id" is null;
--> statement-breakpoint
alter table "schools"
add constraint "schools_initial_card_rollout_manual_completion_check"
check (
  (
    "initial_card_rollout_completed_at" is null
    and "initial_card_rollout_completed_by_internal_membership_id" is null
  )
  or
  (
    "initial_card_rollout_completed_at" is not null
    and "initial_card_rollout_completed_by_internal_membership_id" is not null
  )
);
