# CASA School ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Amazon Rekognition Biometric Engine Adapter

## Position in CASA

Phase 3F established a provider-neutral biometric gateway.

Phase 3G adds Amazon Rekognition as the first concrete production adapter without replacing that domain abstraction.

Exactly one provider mode is active:

- `HTTP_GATEWAY`
- `AWS_REKOGNITION`

Configure:

`CASA_BIOMETRIC_PROVIDER_MODE=AWS_REKOGNITION`

The existing multipart HTTP gateway remains available as an alternate adapter but is not active at the same time.

## Why session-based liveness

Amazon Rekognition Face Liveness is not an uploaded-file API.

The client completes a short video liveness session using AWS's liveness streaming protocol.

CASA therefore binds every provider session in PostgreSQL before any result may affect enrollment or attendance.

## AWS configuration

Backend runtime:

- `CASA_AWS_REKOGNITION_REGION`
- `CASA_AWS_LIVENESS_STREAM_ROLE_ARN`
- `CASA_AWS_REKOGNITION_QUALITY_FILTER` (defaults to `AUTO`)
- existing CASA face/liveness confidence thresholds;
- existing CASA biometric assertion HMAC secret.

Backend AWS credentials use the normal AWS SDK credential chain and must be supplied through the deployment environment/IAM role, never school settings or PostgreSQL.

For Nigeria, Europe (Ireland / `eu-west-1`) is a sensible first region to evaluate for latency, but CASA does not hard-code it.

## Streaming credentials

AWS Face Liveness streaming occurs from the Scanner/browser.

CASA does not use an unauthenticated shared AWS identity.

Instead, after an authenticated CASA enrollment or terminal request:

1. CASA creates one Face Liveness session;
2. CASA assumes a dedicated streaming role;
3. CASA returns temporary STS credentials;
4. the inline session policy permits only `rekognition:StartFaceLivenessSession`;
5. AWS credentials expire independently;
6. the provider liveness session itself expires in about three minutes.

The future Scanner PWA will pass these credentials to the AWS Amplify Face Liveness component through a custom credentials provider.

The streaming role must not permit:

- CreateFaceLivenessSession;
- GetFaceLivenessSessionResults;
- IndexFaces;
- SearchFacesByImage;
- DeleteFaces;
- unrelated AWS services.

Those remain server-side CASA permissions.

## School isolation

Each school gets a deterministic Rekognition collection:

`casa-school-<school UUID without hyphens>`

A verification only searches the collection derived from the authenticated terminal's school.

The student's current ACTIVE profile stores the AWS Rekognition `FaceId`.

Even if an old replaced face vector temporarily remains in the collection, CASA accepts only a returned match whose `FaceId` is the currently ACTIVE profile reference.

## Enrollment

Enrollment flow:

1. OWNER / ADMIN / SCHOOL_TECHNICIAN obtains Passkey step-up;
2. CASA consumes `BIOMETRIC_ENROLL` or `BIOMETRIC_REENROLL`;
3. CASA creates and binds an AWS Face Liveness session;
4. client completes AWS liveness;
5. CASA retrieves the result directly from AWS;
6. CASA independently checks the configured liveness threshold;
7. CASA uses the transient AWS reference image to `IndexFaces`;
8. CASA activates only the returned `FaceId`;
9. no source image is stored in the school database.

AWS collections store face vectors rather than source images.

CASA does not configure an S3 OutputConfig for liveness, so it does not deliberately persist AWS reference/audit images.

## Re-enrollment and cleanup

Re-enrollment:

- revokes the old CASA biometric profile;
- activates the new FaceId;
- appends REENROLLED audit evidence;
- creates a durable provider cleanup job for the replaced FaceId;
- immediately attempts `DeleteFaces`.

If deletion fails, the job remains `PENDING` for a later cleanup worker.

The old FaceId is not accepted for attendance because matching is always checked against the current ACTIVE profile FaceId.

## Verification

After QR/card identification creates a PENDING attempt:

1. authenticated school terminal starts a bound AWS liveness session;
2. Scanner completes Face Liveness;
3. CASA retrieves liveness confidence + reference image server-side;
4. CASA applies its configured liveness threshold;
5. CASA searches only the terminal school's collection;
6. CASA requires the currently ACTIVE student's exact FaceId above the configured face threshold;
7. CASA creates its existing signed `CASABIO1` assertion;
8. Phase 3D atomically commits CHECK_IN/CHECK_OUT.

The Scanner never receives the assertion signing key and never tells CASA that face/liveness passed.

## Session binding

`biometric_liveness_sessions` binds a provider session to exactly one purpose.

Enrollment sessions bind:

- school;
- student;
- initiating membership;
- consumed Passkey action.

Verification sessions bind:

- school;
- student;
- attendance attempt;
- terminal.

A provider session cannot be moved from one student/attempt/terminal to another.

Only one CREATED enrollment session per school/student and one CREATED verification session per school/attempt may exist.

## Liveness failures and retries

A provider session in AWS FAILED/EXPIRED state is closed in CASA.

Provider transport/service errors are not converted into false face mismatches.

A genuinely completed liveness result below CASA policy rejects the attendance attempt.

The PWA must create a new provider session for a provider-session retry.

## Privacy

The ordinary CASA School database contains:

- provider session IDs;
- provider FaceId references;
- confidence scores;
- lifecycle/audit metadata.

It does not contain:

- raw liveness video;
- reference image bytes;
- audit image bytes;
- reusable local facial template;
- AWS secret access keys.

Temporary STS credentials are returned only for the immediate liveness streaming ceremony and are never persisted in PostgreSQL.

## Still pending

Phase 3G is backend infrastructure.

The next Scanner PWA phase will add the actual AWS Amplify `FaceLivenessDetector` camera experience and custom temporary-credential provider.

Production rollout also still requires CASA biometric threshold calibration.
## Phase 3H Scanner integration

The `/scanner` PWA now uses Amplify UI `FaceLivenessDetectorCore` with a custom credentials provider.

The provider returns only the temporary STS credentials that Phase 3G created for the bound session. CASA does not require Cognito user migration.

On analysis completion the browser asks CASA to complete the bound liveness session. The browser does not evaluate AWS confidence scores itself.

Client cancellation marks the provider session FAILED and permits a fresh liveness session for the same still-pending attendance attempt.
## Phase 3J enrollment operations

The School Technician workbench now drives the existing Passkey-authorized AWS enrollment liveness flow.

Enrollment sessions can also be explicitly cancelled by the same school membership that created them. Cancellation marks the CASA session FAILED with CLIENT_CANCELLED and does not create or replace a biometric profile.

The AWS Face Liveness streaming credential remains transient browser memory only.