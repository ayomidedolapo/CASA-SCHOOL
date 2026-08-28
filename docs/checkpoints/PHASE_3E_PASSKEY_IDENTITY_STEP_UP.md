# CASA School Ã¢â‚¬â€ Phase 3E Passkey Identity & Step-Up

Status: GREEN

## Added

- current SimpleWebAuthn server dependency;
- WebAuthn RP configuration;
- Passkey credential persistence;
- one-use WebAuthn challenge persistence;
- passwordless/discoverable Passkey login;
- authenticated Passkey registration;
- school-scoped Passkey step-up;
- one-use five-minute action grants;
- same opaque session system for password and Passkey login;
- Passkey security-event vocabulary;
- Passkey inventory API.

## CASA security properties

- user verification required;
- resident/discoverable credential required for registration;
- production RP ID/origin must be explicit;
- no fingerprint/Face ID/PIN data enters CASA;
- step-up grants store only SHA-256 hashes;
- grants are action/user/school/membership scoped;
- grants are single-use and expire after five minutes.

## Frontend

No visual Passkey UI or School Admin redesign is included.

Browser UI will later call these APIs with the WebAuthn browser ceremony.
## Phase 3E recovery

The initial Phase 3E run stopped before migration generation because 	sx compiled the self-test using CommonJS output, where top-level wait is unsupported.

The first recovery moved WebAuthn option-generation awaits into sync main() without changing project module mode or WebAuthn behavior.

Typecheck then exposed Node 22 / modern TypeScript typed-array strictness: Buffer is Uint8Array<ArrayBufferLike> while SimpleWebAuthn's stored credential contract requires Uint8Array<ArrayBuffer> for WebAuthnCredential.publicKey.

This recovery decodes the stored Base64URL public key into a fresh owned Uint8Array whose backing storage is an ordinary ArrayBuffer. No unsafe cast, skipLibCheck, or module/tsconfig relaxation was used.

## Migration

Applied:

drizzle/20260828024845_passkey-identity-step-up/migration.sql

Verified:

- eleven total Drizzle migrations;
- three Passkey/WebAuthn tables;
- required credential/challenge/grant uniqueness and school-membership scope constraints;
- zero Passkeys, challenges, or step-up grants manufactured by migration verification;
- all ten earlier migrations remained immutable;
- Passkey self-test and all existing self-tests passed;
- typecheck, lint, and production build passed;
- public Passkey login-options endpoint returned HTTP 200;
- anonymous Passkey registration-options endpoint returned HTTP 401.
