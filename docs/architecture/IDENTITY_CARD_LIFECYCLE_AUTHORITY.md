# Identity Card Lifecycle Authority

The legacy `student_identity_card_events` audit table originally required every event to have a school membership actor.

That is correct for school-user card operations, but it cannot truthfully represent central CASA renewal production.

Migration 19 introduces two lifecycle authority modes:

- `SCHOOL_MEMBER`
  - `actor_membership_id` is required.
- `CASA_INTERNAL`
  - `actor_membership_id` must be null.

Existing rows receive `SCHOOL_MEMBER` through the database default, so their meaning does not change.

This does not weaken school-user card controls. School-facing issue/reissue remains protected by the existing Passkey flow and continues to record the real membership.

Central renewal can now record `ISSUED` and `REPLACED` lifecycle events as `CASA_INTERNAL` without inventing a membership.

The table's existing `created_at` remains the authoritative lifecycle-event timestamp. No `occurred_at` column is introduced.

Migration 19 performs no lifecycle data rewrite or deletion.
