# CASA School â€” Passkey Identity & Step-Up

## CASA signature identity

Passkeys are a first-class CASA identity capability.

CASA School supports both:

- password login;
- Passkey login.

Password support does not replace Passkeys, and Passkeys do not require a separate CASA user account.

Both authentication methods resolve to the same global `users` identity and create the same opaque CASA auth session.

## WebAuthn implementation

CASA School uses the server-side WebAuthn protocol through `@simplewebauthn/server`.

Production configuration:

- `CASA_WEBAUTHN_RP_NAME`
- `CASA_WEBAUTHN_RP_ID`
- `CASA_WEBAUTHN_ORIGINS`

Production must configure RP ID and allowed origin(s) explicitly.

Development defaults:

- RP ID: `localhost`
- origin: `http://localhost:3000`

The RP must be configured to the real CASA School production hostname before production Passkey enrollment.

## Registration

Passkey registration requires an existing authenticated CASA session.

The generated credential uses:

- discoverable/resident credential required;
- user verification required;
- attestation `none`;
- non-PII internal UUID bytes as WebAuthn user ID.

The credential public key is public cryptographic material and is stored in the database.

CASA never receives:

- fingerprint data;
- Face ID image;
- device PIN;
- local device biometric template.

Those remain within the authenticator/platform.

## Stored credential

`auth_passkeys` stores:

- CASA user;
- credential ID;
- public key;
- WebAuthn user ID;
- signature counter;
- device type;
- backup state;
- transports;
- optional label;
- last-used/revocation timestamps.

## Passkey login

Passkey login is username-less/discoverable.

The browser asks the authenticator for a CASA credential, CASA resolves its credential ID to the global user, verifies:

- challenge;
- RP ID;
- expected origin;
- signature;
- user verification;
- credential public key/counter.

Success creates the same seven-day opaque auth session used by password login.

## Ceremony challenges

`auth_webauthn_challenges` stores one-use, expiring server challenges for:

- registration;
- login;
- step-up.

Challenges expire after five minutes.

A consumed or expired challenge cannot be reused.

## Privileged authorization

Passkey step-up is distinct from ordinary login.

Sensitive operations request a Passkey ceremony bound to:

- current authenticated user;
- current school;
- current membership;
- exact action.

Supported action vocabulary initially includes:

- `BIOMETRIC_ENROLL`
- `BIOMETRIC_REENROLL`
- `TERMINAL_PROVISION`
- `TERMINAL_ROTATE`
- `TERMINAL_REVOKE`
- `EARLY_DEPARTURE`
- `PASSKEY_REVOKE`
- `ROLE_CHANGE`
- `SECURITY_SETTINGS`

After successful WebAuthn verification, CASA returns one short-lived bearer grant:

`CASASTEP1.<256-bit-random-secret>`

Only SHA-256 of that grant is stored.

The grant:

- expires after five minutes;
- is scoped to user + school + membership + action;
- is single-use;
- cannot authorize another action.

Sensitive backend operations consume the grant atomically.

## Next integrations

Phase 3E establishes the reusable authorization mechanism.

The next implementation phases will wire it into:

- biometric enrollment/re-enrollment;
- terminal provisioning/rotation/revocation;
- early-departure staff approval;
- privileged role/security changes.

No fake password substitute is used for operations CASA has designated Passkey-sensitive.