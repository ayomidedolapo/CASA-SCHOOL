# CASA School Ã¢â‚¬â€ Phase 1E Secure Login

Status: GREEN

## Added

- privacy-preserving auth event log;
- database-backed identifier login throttling;
- HMAC security fingerprints;
- normalized email/E.164 login identifiers;
- dummy-hash verification for unknown accounts;
- public password login endpoint with generic failures;
- rate-limit `Retry-After`;
- logout security event;
- local-only first school/owner provisioning workflow;
- generated local `AUTH_SECURITY_HMAC_SECRET`.

## Current throttle

- five failed attempts;
- fifteen-minute rolling window;
- fifteen-minute block.

## Privacy

The auth event system does not store plaintext login identifiers, raw passwords, password hashes, or session tokens.

## Provisioning

The first owner is not automatically created by this installer.

Provisioning remains a deliberate next action using the secure local PowerShell workflow after Phase 1E is GREEN.
## Migration

Applied:

drizzle/20260827174117_secure-login/migration.sql

Verified:

- two secure-login tables;
- three total Drizzle migrations;
- rate-limit composite primary key;
- all previous migrations unchanged;
- TypeScript, lint, build, and auth cryptographic self-test green.
