# CASA School â€” Biometric Provider Gateway

## Purpose

CASA School now has the server-side application boundary for real student face enrollment and face+liveness verification.

There was no existing CASA Institution face engine available to reuse.

Therefore CASA School does not hard-code a vendor into its school database/domain model.

Instead, CASA connects to a server-configured biometric gateway.

## Required provider configuration

The application runtime uses:

- `CASA_BIOMETRIC_PROVIDER_BASE_URL`
- `CASA_BIOMETRIC_PROVIDER_API_KEY`
- `CASA_BIOMETRIC_PROVIDER_NAME`
- `CASA_BIOMETRIC_FACE_MIN_CONFIDENCE_BPS`
- `CASA_BIOMETRIC_LIVENESS_MIN_CONFIDENCE_BPS`
- existing `CASA_BIOMETRIC_ASSERTION_HMAC_SECRET`

Production requires HTTPS for the provider gateway.

The provider URL is server configuration only. It is never supplied by the school, student, terminal, or request body.

Provider credentials are never stored in PostgreSQL.

## Provider enrollment contract

CASA sends:

`POST /v1/enroll`

as multipart form data:

- `schoolId`
- `studentId`
- `requestId`
- transient `capture`

Provider response:

```json
{
  "provider": "configured-provider-name",
  "subjectRef": "provider-side-student-reference",
  "enrollmentId": "provider-enrollment-reference",
  "liveness": {
    "passed": true,
    "confidenceBps": 9700
  }
}
```

The capture is never persisted by CASA School.

The provider/gateway is responsible for secure provider-side biometric storage and matching semantics.

## Enrollment authorization

OWNER, ADMIN, or SCHOOL_TECHNICIAN may reach the enrollment domain.

However, the enrollment mutation requires a fresh one-use Passkey step-up grant.

First enrollment consumes:

`BIOMETRIC_ENROLL`

Re-enrollment consumes:

`BIOMETRIC_REENROLL`

A password session alone cannot activate or replace a student's biometric profile.

## Re-enrollment

Re-enrollment does not overwrite the old row.

CASA atomically:

1. revokes the previous ACTIVE biometric profile;
2. creates a new ACTIVE provider reference;
3. appends a `REENROLLED` profile event.

This preserves history.

## Capture transport

The API accepts multipart `capture` media:

- JPEG;
- PNG;
- WebP;
- WebM video;
- MP4 video.

Maximum accepted request capture is 12 MiB.

Video support is deliberate because meaningful liveness detection may require motion/challenge data rather than a single still image.

No raw capture is written to the ordinary CASA School database.

## Provider verification contract

For a Scanner pending attempt CASA sends:

`POST /v1/verify`

with:

- school ID;
- student ID;
- verification attempt ID;
- active provider subject reference;
- transient camera capture.

Expected provider response:

```json
{
  "provider": "configured-provider-name",
  "verificationId": "provider-verification-reference",
  "face": {
    "passed": true,
    "confidenceBps": 9550
  },
  "liveness": {
    "passed": true,
    "confidenceBps": 9750
  }
}
```

CASA independently enforces its configured confidence thresholds.

Provider `passed=true` is not enough when the returned confidence is below CASA policy.

## Successful verification

After provider success and CASA threshold acceptance, trusted server code:

1. creates a short-lived signed `CASABIO1` assertion;
2. verifies that assertion using the same server secret;
3. invokes Phase 3D atomic presence finalization;
4. records immutable biometric evidence;
5. records CHECKED_IN or CHECKED_OUT presence;
6. queues guardian WhatsApp delivery for normal CHECK_OUT when configured.

The assertion is not supplied by the Scanner and the signing key is never exposed to it.

## Failed verification

A provider face mismatch, liveness failure, or below-policy confidence rejects the pending attempt and persists:

- FAILED/PASSED provider outcomes;
- returned confidence scores;
- reason code;
- completion timestamp.

A rejected biometric attempt never creates accepted presence.

## Provider availability

Provider timeout, invalid provider response, or gateway failure returns a service-unavailable response.

CASA does not transform provider downtime into a failed face match.

The attendance attempt can therefore be retried according to the later Scanner UX/retry policy.

## Thresholds

CASA does not silently choose production thresholds.

The two confidence thresholds must be explicitly configured.

Before production rollout, thresholds must be calibrated against CASA's own consenting dataset and chosen operating point.

## Privacy

The school database stores provider-side references and verification evidence only.

It does not store:

- raw capture;
- reusable face template;
- provider access key;
- device biometric;
- Passkey biometric information.

Provider-side retention and deletion must be governed separately in the biometric-service deployment.