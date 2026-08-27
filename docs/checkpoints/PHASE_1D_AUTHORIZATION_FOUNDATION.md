# CASA School Ã¢â‚¬â€ Phase 1D Authentication & Authorization Foundation

Status: GREEN

## Added

- `auth_password_credentials`
- `auth_sessions`
- Argon2id password hashing
- password policy validation
- opaque random session tokens
- SHA-256 token storage
- HttpOnly session cookie primitives
- current-session resolution
- individual and all-user session revocation
- active-school membership resolution
- current multi-role authorization
- safe `/api/auth/session`
- safe `/api/auth/logout`
- auth cryptographic self-test

## Deliberately deferred

- password login endpoint
- login rate limiting
- authentication event log
- first school/owner provisioning
- password reset/recovery
- Passkeys
- guardian/student login experiences
- Motherboard SSO/integration

The login endpoint is intentionally withheld until its abuse controls and provisioning path are implemented together.
## Migration

Applied:

drizzle/20260827171725_school-auth-foundation/migration.sql

Verified development state:

- two authentication tables present;
- two total Drizzle migrations applied;
- session token hash uniqueness enforced;
- initial migration remained immutable;
- Argon2id self-test passes;
- TypeScript, lint, and production build pass.

## TypeScript compatibility note

@node-rs/argon2 2.1.0 exports its algorithm selector as an ambient const enum, which conflicts with CASA School's isolatedModules TypeScript setting.

CASA School therefore relies on the package's documented Argon2id default while explicitly pinning memory, iteration, parallelism, and output-length parameters.
