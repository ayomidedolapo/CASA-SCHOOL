# CASA School â€” Secure Login and First-Owner Provisioning

## Login identifier

CASA School accepts a normalized email address or E.164 phone number.

The public login response does not disclose whether an account exists.

## Password verification

Unknown accounts still execute an Argon2id verification against a dummy credential hash to reduce useful timing differences between known and unknown identifiers.

## Throttling

Failed password attempts are throttled by an irreversible HMAC fingerprint of the normalized login identifier.

Current baseline:

- 5 failed attempts;
- 15-minute window;
- 15-minute block.

The limiter is account/identifier based rather than source-IP based. This reduces the risk that one malicious person on a school's shared/NAT network can lock out unrelated users.

Source-address fingerprints may be recorded for security analysis only when trusted proxy-header handling is explicitly enabled.

## Security-event privacy

CASA School does not store plaintext login identifiers in the authentication event table.

It stores HMAC-SHA256 fingerprints derived with `AUTH_SECURITY_HMAC_SECRET`.

Passwords, password hashes, session tokens, and raw proxy headers are never written to the login event log.

## Proxy trust

CASA School ignores source-IP forwarding headers by default.

Source addresses are considered only when:

`CASA_TRUST_PROXY_HEADERS=true`

and `CASA_PROXY_IP_HEADER` is one of:

- `x-forwarded-for`
- `x-real-ip`
- `cf-connecting-ip`

Deployment must enable this only behind a trusted edge that overwrites/sanitizes the selected header.

## First owner

There is no public endpoint that creates the first CASA School owner.

The initial school/owner is provisioned locally using:

`scripts/provision-first-owner.ps1`

The provisioning transaction is allowed only while both `schools` and `users` are empty.

The password is entered using PowerShell `Read-Host -AsSecureString` and is passed to the Node provisioning process only through a temporary environment variable that is removed afterward.

## Public login route

`POST /api/auth/login`

Success:

- creates an opaque database session;
- sets the HttpOnly session cookie;
- records `LOGIN_SUCCESS`.

Failure:

- returns a generic credential failure;
- increments identifier throttling;
- records `LOGIN_FAILURE`.

Blocked attempts:

- return HTTP 429 with `Retry-After`;
- record `LOGIN_RATE_LIMITED`.

## Logout

`POST /api/auth/logout`

The current session is revoked and a logout event is recorded when an authenticated session existed.