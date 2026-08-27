# CASA School ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Authentication and Authorization Foundation

## Separation of concerns

CASA School treats these as different decisions:

1. Authentication ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â who is the user?
2. Session management ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â is this browser still authenticated?
3. School access ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â does this user currently belong to this school?
4. Authorization ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â what roles does the user currently hold in that school?

A session does not permanently embed school roles.

Every school-scoped request resolves current membership and current roles from PostgreSQL. Revoking a membership or role therefore takes effect without issuing a replacement session.

## Password storage

Staff/admin password credentials use Argon2id.

CASA School currently uses:

- memory: 19 MiB;
- iterations: 2;
- parallelism: 1;
- output: 32 bytes.

Passwords are never stored or logged in plaintext.

The initial policy accepts 12 to 128 characters and does not impose composition rules that encourage predictable substitutions.

## Sessions

Sessions are database-backed opaque sessions.

The browser receives a cryptographically random 256-bit token.

PostgreSQL stores only the SHA-256 digest of that random token.

The raw session token is placed in an HttpOnly cookie.

Production cookie properties include:

- `Secure`;
- `HttpOnly`;
- `SameSite=Lax`;
- `Path=/`;
- high priority.

The production cookie name uses the `__Host-` prefix.

Sessions have a seven-day hard expiry and can be revoked individually or per user.

## Tenant authorization

School context is never trusted merely because a user is logged in.

`requireSchoolAccess(slug)` verifies:

- authenticated active global user;
- active school;
- active membership connecting that user to that school;
- current roles from `school_membership_roles`.

`requireSchoolRole(slug, roles)` adds role authorization.

## Student accounts

Student records and student authentication remain separate concepts.

Creating a student record must not automatically create a login identity.

This is important for primary-school deployments where students may not have individual accounts.

## Public authentication surface

Phase 1D does not expose a password login endpoint.

The cryptographic and session engine is established first.

The login surface will be introduced with:

- request validation;
- rate limiting;
- safe failure behavior;
- authentication event logging;
- first-owner provisioning;
- password-change lifecycle.

This prevents a partially protected login endpoint from being exposed during foundation work.
## Phase 1E

The public password login surface, privacy-preserving authentication events, identifier throttling, and local first-owner provisioning are defined in `docs/architecture/SECURE_LOGIN_AND_PROVISIONING.md`.
## Phase 1F live proof

The first-owner provisioning and end-to-end authentication proof is recorded in `docs/checkpoints/PHASE_1F_FIRST_OWNER_E2E.md`.