# CASA School ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Phase 2D Student Identity & Operating Model

Status: GREEN

## Corrections

- CASA Student ID becomes mandatory and platform-generated.
- School admission/student number becomes optional.
- `SCHOOL_TECHNICIAN` becomes a first-class school-scoped role.
- Registry/student/guardian/enrollment/card operations allow OWNER, ADMIN, or SCHOOL_TECHNICIAN.
- OWNER/ADMIN-only administration helper remains available for future privileged settings.
- Existing functional Registry UI is corrected only enough to display CASA Student ID and optional school number.
- Frontend visual expansion is frozen.

## Architecture locked

- initial rollout may be performed by CASA Technical;
- ongoing school registration may be performed by School Technician;
- Scanner is an installable school-bound PWA;
- password and Passkey coexist;
- Passkey step-up remains part of privileged authorization;
- card master templates remain CASA-only;
- raw student QR credentials are never persisted for later printing;
- final card front/back artifacts are rendered server-side under CASA control;
- each finished card receives a separate high-entropy public-by-link ID Card URL requiring no login/authorization;
- public card URLs remain revocable/rotatable and are independent from the student QR credential;
- completed onboarding will later emit a CASA operations event;
- CASA will later have a cross-school card-production queue and `.xlsx` batch manifest/export with clickable ID Card URL.

## Database

Phase 2D intentionally adds one migration for:

- `students.casa_student_id`;
- nullable `students.admission_number`;
- `SCHOOL_TECHNICIAN` enum value.

No earlier migration may change.
## Student sign-out requirement

The Scanner PWA is required to support student departure as well as arrival.

After the school's configured dismissal time, a student signs out at an ACTIVE school terminal using card + face + liveness verification.

Successful sign-out will later emit a durable guardian-notification event indicating that the student has left school.

Early departure will require an authorized staff override and reason.

This will be implemented as an additive attendance migration after Phase 2D; the already-GREEN Phase 3A migration remains immutable.
## Recovery completion

The first Phase 2D V3 run stopped at ESLint before migration generation because a functional Registry sentence contained an unescaped JSX apostrophe.

Recovery:

- rewrote only that sentence;
- disabled no lint rule;
- preserved the existing GREEN Phase 3A attendance foundation;
- locked CHECK_IN + CHECK_OUT, guardian departure notification, and early-departure authorization into the attendance follow-up;
- generated and applied Phase 2D as migration 7;
- kept the six previous migrations immutable.

Applied:

drizzle/20260828014547_student-identity-operating-model/migration.sql
