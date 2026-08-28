# CASA School Ã¢â‚¬â€ Phase 3H Scanner PWA

Status: GREEN

## Added

- installable `/scanner` PWA;
- Next.js web app manifest;
- scanner service worker with intentionally no fetch caching;
- IndexedDB terminal credential storage;
- one-time terminal provisioning screen;
- rear-camera QR scanning with ZXing;
- server-resolved AUTO CHECK_IN/CHECK_OUT;
- Amplify FaceLivenessDetectorCore with custom temporary credentials;
- face-analysis completion wired to trusted CASA finalization;
- retry-safe liveness cancellation;
- automatic success reset for the next student;
- normal sign-out guardian notification status;
- terminal lifecycle Passkey enforcement.

## Security

- terminal API calls omit browser user cookies;
- terminal bearer credential never enters URL/localStorage/service worker;
- raw student QR is not persisted by the PWA;
- temporary AWS credentials live only in current React state;
- service worker caches no attendance/identity data;
- terminal lifecycle mutations require Passkey step-up;
- early departure remains staff-authorized rather than terminal-authorized.

## Database

No schema migration is expected in Phase 3H.

The existing thirteen migrations must remain byte-for-byte unchanged.
## Final manifest verification recovery

V4 reached live smoke verification after all self-tests, typecheck, lint, production build, and migration immutability checks passed.

Its manifest assertion used a raw-content regex. V5 replaced that assertion with structured manifest JSON verification and confirmed:

- HTTP 200;
- `name = CASA School Scanner`;
- `start_url = /scanner`;
- `display = standalone`.

## Final verification

- Scanner contract self-test passed;
- AWS biometric and all previous self-tests passed;
- typecheck passed;
- ESLint passed;
- production build passed;
- thirteen migration files remained byte-for-byte unchanged;
- database remains at thirteen applied migrations;
- `/scanner` returned HTTP 200;
- `/manifest.webmanifest` returned valid expected manifest JSON;
- `/scanner-sw.js` returned HTTP 200 and contains no fetch cache;
- anonymous terminal session, AUTO scan, and AWS liveness start returned HTTP 401.

No live AWS biometric operation or operational attendance data was manufactured.