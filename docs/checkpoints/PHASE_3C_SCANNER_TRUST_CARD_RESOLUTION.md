# CASA School Ã¢â‚¬â€ Phase 3C Scanner Trust & Card Resolution

Status: GREEN

## Added

- append-only attendance terminal lifecycle events;
- terminal credential versioning;
- terminal scan request idempotency;
- 256-bit one-time terminal credentials;
- SHA-256-only terminal secret storage;
- strict Bearer terminal authentication;
- terminal credential rotation;
- suspend/reactivate/revoke lifecycle;
- school-local active attendance-session resolver;
- secure `CASA1` QR parsing/hash resolution;
- idempotent terminal scan API;
- CHECK_IN pre-biometric validation;
- CHECK_OUT pre-biometric validation;
- early-departure authorization marker.

## Deliberately not added

- biometric face verification;
- liveness provider;
- accepted attendance creation from QR alone;
- accepted CHECK_OUT from QR alone;
- guardian notification emission from unverified QR scans;
- Scanner visual PWA;
- fake/pass-through Passkey checks.

Passkey step-up remains required for a later real WebAuthn authorization phase.
## Migration

Applied:

drizzle/20260828020702_scanner-trust-card-resolution/migration.sql

Verified:

- nine total Drizzle migrations;
- append-only terminal lifecycle audit table;
- terminal credential versioning;
- terminal request-id uniqueness;
- zero operational terminal/attendance rows created;
- all eight earlier migrations remained immutable;
- terminal credential/QR self-test passed;
- attendance/card/auth self-tests passed;
- typecheck, lint, and build passed;
- anonymous /api/terminal/session returned HTTP 401;
- anonymous /api/terminal/scan returned HTTP 401.
