# CASA School Ã¢â‚¬â€ Phase 3D Trusted Biometric Presence Finalization

Status: GREEN

## Added

- provider-reference-only student biometric profile model;
- immutable biometric verification evidence;
- short-lived HMAC-signed CASA biometric assertion contract;
- assertion tamper/expiry protection;
- active profile/provider matching;
- atomic verified CHECK_IN finalization;
- atomic verified normal CHECK_OUT finalization;
- immutable accepted presence events;
- guardian sign-out outbox creation after verified departure;
- school-specific ACTIVE WhatsApp sender use.

## Security boundaries

- Scanner cannot self-assert biometric success;
- no raw biometric image/template is stored in ordinary school DB tables;
- assertion signing secret never enters PostgreSQL;
- assertion lifetime is capped at two minutes;
- QR alone still cannot record attendance;
- EARLY departure remains blocked until real Passkey step-up authorization exists.

## Deferred

- actual face enrollment API;
- actual biometric/liveness provider adapter;
- threshold calibration;
- real Passkey/WebAuthn step-up;
- WhatsApp delivery worker;
- Scanner visual PWA.
## Migration

Applied:

drizzle/20260828022058_trusted-biometric-presence-finalization/migration.sql

Verified:

- ten total Drizzle migrations;
- student biometric profile + trusted verification evidence tables;
- seven required biometric uniqueness/tenant constraints;
- one ACTIVE biometric profile maximum per student;
- zero biometric/terminal/attendance/outbox data manufactured;
- all nine earlier migrations remained immutable;
- signed assertion tamper/expiry self-test passed;
- terminal/attendance/card/auth self-tests passed;
- typecheck, lint, and build passed;
- anonymous biometric finalization returned HTTP 401.
