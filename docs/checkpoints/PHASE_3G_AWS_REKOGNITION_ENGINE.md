# CASA School Ã¢â‚¬â€ Phase 3G AWS Rekognition Biometric Engine

Status: GREEN

## Added

- Amazon Rekognition concrete biometric provider adapter;
- explicit single active provider mode;
- AWS Face Liveness session binding;
- short-lived STS streaming credentials restricted to StartFaceLivenessSession;
- school-isolated Rekognition face collections;
- Passkey-authorized enrollment liveness;
- exact ACTIVE FaceId attendance matching;
- server-side liveness result retrieval;
- durable cleanup job for replaced AWS FaceIds;
- enrollment and terminal liveness start/complete APIs.

## Privacy/security

- no AWS credentials stored in PostgreSQL;
- no raw liveness video stored in CASA School DB;
- no deliberate S3 liveness-output storage;
- collections are school-specific;
- old/revoked FaceIds cannot satisfy active attendance matching;
- provider session is bound to student + school + membership or attendance attempt + terminal;
- Scanner still cannot self-assert biometric success.

## Frontend

No Scanner camera UI is included yet.

The next phase will wire AWS Amplify FaceLivenessDetector into the installable Scanner PWA using the temporary credentials produced here.
## Migration

Applied:

drizzle/20260828032347_aws-rekognition-biometric-engine/migration.sql

Verified:

- thirteen total Drizzle migrations;
- provider liveness session table;
- durable provider cleanup table;
- school/student/attempt/terminal/membership constraints;
- one active enrollment liveness session per student;
- one active verification liveness session per attendance attempt;
- zero biometric operational rows manufactured;
- all twelve earlier migrations remained immutable;
- AWS adapter pure-function self-test and all previous self-tests passed;
- typecheck, lint, and production build passed;
- anonymous enrollment liveness start returned HTTP 401;
- anonymous terminal liveness start returned HTTP 401.

No live AWS call was made by the installer because production AWS credentials/roles/thresholds must be configured explicitly.
