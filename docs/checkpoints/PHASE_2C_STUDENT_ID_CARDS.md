# CASA School Ã¢â‚¬â€ Phase 2C Student ID Cards

Status: GREEN

## Added

- 256-bit opaque student card credentials;
- SHA-256-only persisted card token hashes;
- one-time QR credential response;
- ID-card issuance API;
- lost/revoke/expire lifecycle API;
- atomic replacement API;
- append-only card lifecycle audit events;
- acting membership attribution;
- Registry card-management UI;
- QR preview;
- card cryptographic self-test.

## Migration

Phase 2C intentionally adds one migration for `student_identity_card_events` and the card-event enum.

No existing migration may change.
## Explicit anonymous-session recovery

The first Phase 2C live smoke test used Invoke-WebRequest without an explicit WebRequestSession and received HTTP 404 from the nonexistent probe-student route.

Recovery removed client-session ambiguity by:

1. starting a fresh CASA School process on an OS-selected loopback port;
2. creating a new empty WebRequestSession;
3. proving /api/auth/session returns uthenticated=false for that exact session;
4. sending the exact same anonymous session to the card route;
5. verifying the card route returns HTTP 401;
6. separately logging in the OWNER and verifying the same nonexistent probe student returns HTTP 404 only after authentication.

This preserves the intended authorization contract rather than accepting 404 as an anonymous response.

## Live verification complete

- card:selftest passed;
- uth:selftest passed;
- TypeScript passed;
- ESLint passed;
- production build passed;
- explicit anonymous session -> uthenticated=false;
- anonymous card route -> HTTP 401;
- OWNER login -> HTTP 200;
- authenticated card route/nonexistent probe student -> HTTP 404;
- protected School Registry rendered;
- verification session logged out;
- no registry, card, or card-event data was manufactured;
- all four Phase 2B migrations remained unchanged;
- Phase 2C remains the single fifth migration.
