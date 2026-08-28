# CASA School ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Trusted Biometric Presence Finalization

## Security rule

A Scanner PWA is not trusted to assert that a face or liveness check passed.

It cannot finalize attendance with:

`{ "facePassed": true }`

Instead, a trusted server-side biometric adapter must produce a short-lived cryptographically signed CASA assertion.

The assertion is bound to:

- verification attempt;
- student;
- active biometric profile;
- provider;
- provider verification ID;
- face confidence;
- liveness confidence;
- issue time;
- expiry time;
- unique assertion ID.

Both face and liveness must be PASSED.

## Assertion format

`CASABIO1.<base64url-payload>.<HMAC-SHA256-signature>`

Signing key:

`CASA_BIOMETRIC_ASSERTION_HMAC_SECRET`

The key must be at least 256 bits and stored in the deployment secret layer.

It must not be:

- returned to the Scanner PWA;
- stored in PostgreSQL;
- exposed in school settings;
- committed to source control.

Assertions may live for at most two minutes.

Replay protection is enforced by immutable assertion/provider-verification uniqueness in the evidence table.

## Student biometric profile

`student_biometric_profiles` stores only provider-side references.

It does not store:

- raw face photographs;
- biometric image blobs;
- reusable facial templates;
- provider secrets.

A finalization assertion must reference the student's ACTIVE profile in the same school and the provider must match.

The actual face-enrollment workflow is the next biometric implementation layer.

## Verification evidence

`biometric_verification_evidence` is append-only trusted evidence for an accepted attempt.

It stores:

- attempt;
- student;
- biometric profile;
- assertion ID;
- provider;
- provider verification ID;
- face confidence basis points;
- liveness confidence basis points;
- assertion issue time;
- verification time.

One attempt can have at most one accepted biometric evidence row.

## CHECK_IN atomicity

For an accepted pending CHECK_IN, one PostgreSQL statement performs:

1. create the student's daily attendance record;
2. insert trusted biometric evidence;
3. mark the verification attempt RECORDED with face/liveness PASSED;
4. append CHECKED_IN presence event.

If the daily attendance record already exists, the transaction does not manufacture a second accepted attendance record.

## CHECK_OUT atomicity

For an accepted normal CHECK_OUT, one PostgreSQL statement performs:

1. change the existing daily record from ON_CAMPUS to SIGNED_OUT;
2. record departure time/terminal/card/attempt;
3. insert trusted biometric evidence;
4. mark the verification attempt RECORDED;
5. append CHECKED_OUT presence event;
6. queue one guardian WhatsApp outbox row per eligible guardian when an ACTIVE school WhatsApp sender exists.

The guardian message snapshot is:

`<Student Name> has signed out of school and is on the way home.`

CASA delivers it later through that school's connected WhatsApp sender.

WhatsApp failure cannot roll back the already-accepted departure because provider delivery is asynchronous through the durable outbox.

## No active school WhatsApp sender

Attendance must continue to function if a school has not connected or has temporarily lost its WhatsApp sender.

In that situation CHECK_OUT is still accepted but no provider delivery row can be created.

A later operations/reporting phase must surface accepted departure events that have no guardian outbox because of sender/recipient configuration.

## Early departure

EARLY departure remains intentionally blocked at finalization with:

`PASSKEY_STEP_UP_REQUIRED`

CASA will not replace its Passkey authorization requirement with password-only approval.

A later real WebAuthn/Passkey step-up phase will authorize the staff member and reason, after which the same trusted biometric principles will be used to commit the early departure and guardian notification.

## Provider integration

Phase 3D defines the trust contract, not a fake face engine.

The next biometric layer will implement:

- student face enrollment;
- provider/engine adapter;
- liveness challenge;
- face comparison;
- provider threshold policy;
- creation of the signed CASA biometric assertion.

Only server-side trusted code may possess the assertion signing key.
## Phase 3E Passkey foundation

CASA School now has real WebAuthn/Passkey login and one-use, action-scoped Passkey step-up grants.

The biometric enrollment/re-enrollment layer can therefore require `BIOMETRIC_ENROLL` or `BIOMETRIC_REENROLL` without substituting password approval.

Early departure can later consume an `EARLY_DEPARTURE` grant.

Passkey authentication still uses the same global CASA user and opaque session system.
## Phase 3F provider gateway

CASA School now has Passkey-protected student face enrollment and a server-configured biometric provider gateway.

The Scanner can submit transient camera capture to the authenticated attempt verification endpoint.

Only the server talks to the provider, evaluates CASA thresholds, creates the signed CASA biometric assertion, and invokes atomic finalization.

The Scanner still cannot self-report face/liveness success.