# CASA School ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Student ID Card Lifecycle

## Core principle

**The ID card identifies the student. The face verifies the person.**

Phase 2C implements identification only. Biometric verification is intentionally deferred.

## Credential format

Each issued card receives:

- 256-bit cryptographically random token;
- SHA-256 token hash;
- non-secret display serial number;
- QR payload `CASA1.<base64url-token>`.

Only `token_hash` is persisted.

The raw token and QR payload are returned exactly once by the issuance/replacement API and cannot be reconstructed from PostgreSQL.

## Lifecycle

A student may have only one ACTIVE card.

Supported terminal states are:

- LOST;
- REVOKED;
- REPLACED;
- EXPIRED.

Replacement is atomic:

1. current ACTIVE card becomes REPLACED;
2. replacement ACTIVE card is inserted;
3. old-card REPLACED event is appended;
4. new-card ISSUED event is appended.

These steps run as one PostgreSQL statement using data-modifying CTEs.

## Audit

`student_identity_card_events` is append-only application history.

Every event records:

- school;
- student;
- card;
- acting school membership;
- event type;
- optional reason;
- timestamp.

Card mutation and event insertion run in the same SQL statement.

## Authorization

All card lifecycle routes require current OWNER or ADMIN authority for the exact school slug.

Database queries and foreign keys remain school-scoped.

## UI

The selected-student Registry panel can:

- issue the first card;
- render the one-time QR;
- replace the active card;
- mark the active card lost;
- revoke the active card;
- view card history.

The UI explicitly warns that the raw credential cannot be retrieved after dismissal.

## Deferred

Phase 2C does not yet implement:

- printable branded card layouts;
- scanner/terminal routes;
- face enrollment;
- face templates;
- liveness;
- attendance decisions;
- offline terminal sync.

Those features will consume the card identity foundation built here.
## Phase 3J readiness boundary

The Technician workbench reads card status for identity-readiness decisions but does not expose the raw one-time student-card QR credential.

Legacy card lifecycle remains in Registry until the central personalized card-production engine replaces client-visible raw issuance with server-memory QR rendering and final CASA-controlled artifacts.
## Phase 3K production transition

The Phase 2C raw credential response is retired for all new issuance/reissue.

Existing issued cards remain valid.

New cards require CARD_ISSUE or CARD_REISSUE Passkey step-up and are rendered server-side before the database accepts the new ACTIVE credential hash.

The Registry receives production metadata and a public-by-link finished-card URL, never the raw QR token/payload.

See `CENTRAL_CARD_PRODUCTION_ENGINE.md`.