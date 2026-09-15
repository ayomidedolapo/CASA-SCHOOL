# CASA School - Phase 3I Attendance Operations & Supervised Exceptions

Status: GREEN

## Delivered

- Attendance policy version creation.
- School-local default policy resolution.
- Audited daily attendance session open and close.
- Append-only attendance session events.
- Today expected, on-campus, late, not-arrived, absent, and signed-out state.
- Terminal-health summary.
- Missing guardian-notification outbox exception visibility.
- Passkey-authorized early departure.
- Exact consumed Passkey grant reference in each early-departure authorization.
- Terminal attempt authorization-status endpoint.
- Scanner automatic resume after staff authorization.
- Trusted early-departure biometric finalization.
- Distinct STUDENT_EARLY_DEPARTURE WhatsApp outbox event.
- Dedicated Attendance Operations surface.

## Authorization

OWNER and ADMIN:
- manage attendance policy versions;
- open and close the daily attendance session;
- authorize early departure with a mandatory reason and EARLY_DEPARTURE Passkey step-up;
- view Today attendance operations.

SCHOOL_TECHNICIAN:
- may view Today attendance and terminal health;
- may not change attendance policy or daily-session state;
- may authorize audited early release with mandatory reason + Passkey, while policy/session management remains restricted.

Student Scanner:
- uses the provisioned terminal credential;
- does not require Passkey for normal attendance scans.

## Early departure trust chain

The pending early CHECK_OUT attempt remains bound to the student, card, terminal, daily attendance record, authorizing membership, consumed one-use Passkey grant, reason, and subsequent trusted face+liveness result.

After authorization, the Scanner resumes the same pending attempt rather than creating a bypass or second attendance attempt.

## Migration

Applied:
drizzle/20260828103906_attendance-operations-supervised-exceptions/migration.sql

Verified:
- fourteen total Drizzle migrations;
- two Phase 3I tables;
- eleven required Phase 3I tenant and audit constraints;
- zero operational rows manufactured by the migration at migration verification time;
- all thirteen earlier migration files remained immutable during the Phase 3I run.

## Verification

- Attendance Operations self-test passed.
- Scanner PWA self-test passed.
- AWS Rekognition self-test passed.
- Biometric provider-policy self-test passed.
- Passkey/WebAuthn self-test passed.
- Trusted biometric assertion self-test passed.
- Terminal credential and QR self-test passed.
- Attendance presence self-test passed.
- Student-card cryptographic self-test passed.
- Authentication cryptographic self-test passed.
- TypeScript passed.
- ESLint passed.
- Production build passed.
- Anonymous attendance policy, Today, session, and early-departure operations returned HTTP 401.
- Anonymous terminal attempt authorization status returned HTTP 401.

## Recovery history

The initial Phase 3I installer had an overly strict Phase 3H Scanner text preflight and was corrected before Phase 3I writes.

The first Attendance Operations effect directly invoked state-updating refresh functions from useEffect. The final implementation schedules initial refresh through window.setTimeout and recurring refresh through window.setInterval. The React lint rule remains enabled.

The V4 run completed migration, database verification, tests, lint, build, and live authorization smoke checks. It stopped only during the final Git diff check because the checkpoint Markdown had Windows carriage-return and encoding corruption.

V5 rewrote this checkpoint as canonical UTF-8 with LF-only line endings and no trailing whitespace before the final Git checkpoint.

No broader School Admin visual redesign was performed.
