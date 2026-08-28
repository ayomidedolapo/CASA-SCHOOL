# CASA School Ã¢â‚¬â€ Phase 3F Face Enrollment & Biometric Provider Gateway

Status: GREEN

## Added

- Passkey-protected student biometric enrollment;
- separate BIOMETRIC_ENROLL and BIOMETRIC_REENROLL authorization;
- append-only biometric profile lifecycle events;
- server-configured biometric provider gateway;
- transient image/video capture validation;
- explicit face/liveness confidence policy;
- Scanner terminal biometric verification route;
- trusted server creation of CASA biometric assertions;
- automatic invocation of Phase 3D presence finalization after accepted provider verification;
- rejected attempt evidence for face/liveness failure.

## Privacy/security

- no raw face/video capture stored in ordinary school DB;
- no provider API key stored in PostgreSQL;
- provider URL cannot be supplied by request;
- production provider must use HTTPS;
- enrollment needs Passkey step-up;
- Scanner cannot self-assert biometric success;
- production thresholds are explicit rather than silently invented.

## Frontend

No visual Scanner PWA or School Admin redesign is included.
## Migration

Applied:

drizzle/20260828030204_face-enrollment-biometric-gateway/migration.sql

Verified:

- twelve total Drizzle migrations;
- append-only biometric profile lifecycle event table;
- four school-scoped profile-event foreign keys;
- zero biometric profiles/events/evidence manufactured;
- all eleven earlier migrations remained immutable;
- provider policy self-test and all existing self-tests passed;
- typecheck, lint, and production build passed;
- anonymous biometric profile route returned HTTP 401;
- anonymous terminal biometric verification returned HTTP 401;
- the prior unused import lint warning was removed.
