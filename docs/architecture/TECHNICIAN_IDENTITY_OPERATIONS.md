# CASA School - Technician Identity Operations

## Purpose

Phase 3J makes the existing identity and terminal backend operational for the school employee responsible for setup and support.

The workbench route is:

`/schools/[slug]/technician`

It is available only to OWNER, ADMIN, and SCHOOL_TECHNICIAN.

This is a focused operating surface, not the broad School Admin redesign.

## Student identity readiness

The workbench searches the existing school Registry and shows:

- student name;
- CASA Student ID;
- optional school/admission number;
- active class;
- active face identity status;
- active student-card status.

The card remains the identification factor.

The face remains the person-verification factor.

## Face enrollment

Face enrollment uses the existing AWS Rekognition Face Liveness backend.

The browser first requests the correct CASA Passkey step-up:

- BIOMETRIC_ENROLL if there is no ACTIVE profile;
- BIOMETRIC_REENROLL if an ACTIVE profile is being replaced.

The server independently recomputes and enforces the same action.

Only after the grant is consumed does CASA create a bound AWS liveness session and short-lived streaming credentials.

The browser receives the temporary credentials only for the immediate liveness ceremony.

On successful analysis completion:

1. the browser sends only the CASA liveness-session ID;
2. the server obtains the AWS result;
3. CASA enforces configured liveness confidence policy;
4. CASA indexes the reference face into the school-isolated collection;
5. the previous ACTIVE FaceId is revoked when re-enrolling;
6. a new ACTIVE biometric profile becomes authoritative;
7. durable cleanup work exists for replaced AWS FaceIds.

## Enrollment cancellation

Phase 3J adds explicit enrollment-session cancellation.

A cancellation succeeds only when the session is:

- in the same school;
- for the same student;
- initiated by the same school membership;
- purpose ENROLLMENT;
- provider AWS Rekognition;
- status CREATED.

Cancellation marks the provider session FAILED with CLIENT_CANCELLED in CASA.

It does not enroll a face.

It allows the technician to retry immediately instead of waiting for local session expiry.

## Student cards

This workbench shows card readiness but deliberately does not expose the raw one-time student-card credential.

The existing Registry lifecycle remains available to the authorized school operator.

The next central card-production phase will replace the legacy raw-credential UI path with server-memory rendering into final CASA-controlled personalized artwork.

## Scanner terminals

OWNER, ADMIN, and SCHOOL_TECHNICIAN can operate the terminal lifecycle through the existing Passkey-protected backend.

Provision:
- TERMINAL_PROVISION.

Lifecycle:
- ROTATE_CREDENTIAL -> TERMINAL_ROTATE;
- SUSPEND -> TERMINAL_SUSPEND;
- REACTIVATE -> TERMINAL_REACTIVATE;
- REVOKE -> TERMINAL_REVOKE.

The workbench never stores a returned terminal credential.

The credential exists only in React memory until the operator copies/transfers or dismisses it.

It is never placed into:
- URL parameters;
- localStorage;
- IndexedDB by the technician workbench;
- analytics;
- school spreadsheets by CASA.

The Scanner PWA itself remains responsible for storing its credential in device IndexedDB after direct device provisioning.

## Passkey boundary

Passkey authorizes sensitive human actions.

It is not required for each student attendance scan.

Student attendance remains:

terminal credential -> card -> face -> liveness -> time -> attendance.

## Frontend discipline

The workbench is intentionally narrow.

It uses the CASA editorial/minimal operational language and does not introduce a generic SaaS dashboard or redesign unrelated School Admin screens.