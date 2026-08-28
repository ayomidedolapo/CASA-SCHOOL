# CASA School â€” Scanner PWA Trust Boundary

## Principle

**The ID card identifies the student. The face verifies the person.**

Phase 3C deliberately does not let a QR scan alone create attendance.

The Scanner PWA trust sequence is:

1. authenticate the physical terminal;
2. resolve the school's active attendance session;
3. accept a CASA card payload;
4. hash the raw QR credential immediately;
5. resolve the card only within the terminal's school;
6. evaluate current presence state and school-local time window;
7. write an idempotent verification attempt;
8. require biometric verification before accepted CHECK_IN/CHECK_OUT is committed.

## Terminal credential

A provisioned terminal receives a one-time token:

`CASAT1.<terminal-uuid>.<256-bit-random-secret>`

PostgreSQL stores only SHA-256 of the secret.

The token is intended for private PWA device storage.

It must never be placed in:

- URL query parameters;
- application logs;
- analytics;
- browser-readable shared configuration;
- school spreadsheets.

The Scanner uses:

`Authorization: Bearer <terminal-token>`

Suspended or revoked terminals are rejected.

Credential rotation returns the replacement token once and increments `credential_version`.

The old secret stops authenticating immediately.

## Terminal provisioning

OWNER, ADMIN, and SCHOOL_TECHNICIAN are currently authorized to operate the school terminal lifecycle.

When CASA School's Passkey step-up implementation is introduced, provisioning, credential rotation, revocation, and similar privileged terminal operations must require Passkey authorization without creating a parallel identity system.

Phase 3C does not fake a Passkey check before WebAuthn exists.

## Terminal audit

`attendance_terminal_events` records:

- provisioning;
- suspension;
- reactivation;
- revocation;
- credential rotation;
- acting school membership;
- credential version;
- optional reason.

Lifecycle mutations and their audit event are written atomically with PostgreSQL data-modifying CTEs.

## Active school session

The Scanner resolves time using the school's configured IANA timezone.

It will operate only against the OPEN attendance session for the school's current local date.

The associated weekday policy supplies:

- check-in open;
- on-time cutoff;
- check-in close;
- normal dismissal;
- check-out close.

If no active session/policy exists, scanning cannot proceed.

## QR handling

Student QR payloads have the existing form:

`CASA1.<256-bit-random-token>`

The terminal API never persists or returns the raw token.

The server:

1. validates the prefix/shape;
2. hashes the token with SHA-256;
3. resolves only that hash inside the authenticated terminal's school.

A valid School B QR scanned on a School A terminal is therefore indistinguishable from an unknown School A card.

## Idempotency

Every Scanner request carries a client-generated `requestId`.

The database enforces one verification attempt per:

`school + terminal + requestId`

PWA network retries therefore return the existing attempt rather than manufacturing additional verification attempts.

A request ID must not be reused for a different physical scan.

## CHECK_IN scan

A matched, ACTIVE card belonging to an ACTIVE student is evaluated against:

- today's OPEN session;
- school-local arrival window;
- existing daily attendance record.

A scan is rejected before biometrics when:

- card is unknown;
- card is inactive;
- student is inactive;
- check-in is not open/has closed;
- student is already ON_CAMPUS;
- student has already SIGNED_OUT and re-entry is not enabled.

Otherwise the attempt remains `PENDING` and requires biometric verification.

## CHECK_OUT scan

A matched student can proceed only when an accepted attendance record already places the student ON_CAMPUS.

The Scanner rejects:

- NOT_CHECKED_IN;
- ALREADY_SIGNED_OUT;
- departure after the configured close window.

A normal dismissal scan remains PENDING for biometrics with departure classification NORMAL.

An early scan remains PENDING with `EARLY_DEPARTURE_AUTH_REQUIRED`.

The next phase must combine authorized staff step-up/override with successful biometric evidence before an EARLY departure can be committed.

## No attendance from card alone

Phase 3C does not create:

- `student_attendance_records`;
- accepted `student_presence_events`;
- guardian notification outbox rows.

Those records are created only by the later verified-presence finalization transaction after biometric/liveness evidence is trusted server-side.

This separation prevents a copied QR image from recording presence by itself.

## Scanner PWA

Phase 3C is backend-only.

The later Scanner PWA will:

- install on a school device;
- accept its one-time terminal credential during provisioning;
- securely retain it on-device;
- query `/api/terminal/session`;
- scan CASA QR codes;
- send unique request IDs to `/api/terminal/scan`;
- transition to face/liveness capture only when the server returns a PENDING attempt.

The PWA will not expose the normal School Admin interface.