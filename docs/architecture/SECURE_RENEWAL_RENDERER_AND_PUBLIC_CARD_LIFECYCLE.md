# Secure Renewal Renderer and Public Card Lifecycle

## Central renewal authority

Confirmed renewal-batch items are produced under `CASA_INTERNAL_RENEWAL`.

The internal path:

- requires CASA internal production authentication at the HTTP boundary;
- does not request, synthesize, or consume a school Passkey grant;
- does not fabricate a school membership;
- uses the renewal-batch item ID as `internal_authority_reference`;
- keeps the existing school-user `CARD_ISSUE` / `CARD_REISSUE` flow unchanged.

## Eligibility

Before a credential is created or artwork is rendered, the renewal item must still be unproduced and its target enrollment must be the authoritative ACTIVE enrollment for the renewal batch target session.

The target class arm must still map to the renewal item's branch.

## Visible card data

Production fails before credential generation when any required visible field is unavailable:

- student name;
- school/organization;
- class;
- academic session;
- supported sex (`MALE` → `M`, `FEMALE` → `F`).

Admission number remains optional and is not a visible card requirement.

## Rendering and token handling

`src/server/card-production/renewal-production.ts` owns the CASA-internal renewal orchestration.

The existing `production.ts` remains the school-facing issue/reissue service and supplies only shared read/helper boundaries to the renewal module.

The existing CASA renderer remains authoritative.

The secure card credential is created in memory, its QR payload is rendered into the artwork, and only the existing hash/serial/artifact references are persisted.

## Lifecycle

If the student already has an ACTIVE card, central renewal replaces it and creates a new ACTIVE card.

The replacement and new-card persistence use a Neon HTTP transaction, not one data-modifying CTE. The existing ACTIVE row is updated to `REPLACED` before the new `ACTIVE` row is inserted. This preserves the database invariant that there can be only one ACTIVE card per student while keeping replacement, lifecycle audit, production-job creation, production audit and renewal-item linkage atomic.

The renewal item receives the new `production_job_id`.

The production job records:

- `production_authority = CASA_INTERNAL_RENEWAL`;
- no issuing school membership;
- no Passkey grant;
- the renewal item as internal authority reference.

Identity-card lifecycle events created by central renewal use `actor_kind = CASA_INTERNAL` with no school membership, as authorized by Migration 19.

Production audit events also use `actor_kind = CASA_INTERNAL`.

## Public artifact access

`/id-card/<publicKey>` is public-by-link only while the underlying card remains `ACTIVE`.

LOST, REPLACED, REVOKED and EXPIRED cards fail closed as not found.

Private archived artwork is retained; only public accessibility is revoked.

## Batch behavior

The internal batch-production endpoint processes a bounded number of unproduced renewal items and can be safely resumed.

A batch becomes `READY` when every item has a linked production job.

Export/print lifecycle remains handled by the existing central production workflow.
