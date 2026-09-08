# CASA School — Card Production Authority

## Purpose

CASA has two legitimate card-production origins.

### School membership

A school user explicitly issues or reissues one student card.

This path remains protected by the existing fresh Passkey step-up.

Required authority evidence:

- `production_authority = SCHOOL_MEMBERSHIP`
- `issued_by_membership_id` is present
- `passkey_grant_id` is present
- `internal_authority_reference` is absent

### CASA internal renewal

CASA centrally renders an already-approved annual/session renewal item.

This path must not fabricate a school membership or Passkey grant.

Required authority evidence:

- `production_authority = CASA_INTERNAL_RENEWAL`
- `issued_by_membership_id` is absent
- `passkey_grant_id` is absent
- `internal_authority_reference` identifies the renewal-batch item

The database check constraint makes these modes mutually exclusive.

## Why the legacy columns become nullable

They are not becoming optional for school-user production.

They become nullable only because a different first-class authority mode now exists. The authority check still requires both legacy fields whenever `production_authority = SCHOOL_MEMBERSHIP`.

Therefore the existing school-facing Passkey security contract is preserved.

## Renewal reference

`internal_authority_reference` is a UUID audit reference for the CASA internal authority context. For `CASA_INTERNAL_RENEWAL`, the application service will use the renewal-batch item ID.

The existing renewal item already carries the production-job link. The renderer integration pass will write both sides consistently and will refuse an item that is already linked to another production job.

## Migration 18

Migration 18 is intentionally narrow:

- add `production_authority`;
- add `internal_authority_reference`;
- make the two legacy authority columns nullable;
- add a strict authority check;
- add a unique internal-authority-reference index;
- add an authority/status operational index.

It does not render cards, mutate existing production jobs, apply to Development automatically, or weaken the existing Passkey flow.

## Next steps

1. Prove Migration 18 SQL locally.
2. Apply and verify Migration 18 in Development only.
3. Patch the public artifact route to require an ACTIVE card lifecycle.
4. Connect CASA internal renewal items to the existing secure renderer.
5. Run controlled Development operational proofs.
6. Only then consider Staging promotion.
