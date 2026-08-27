# CASA School Ã¢â‚¬â€ Phase 2B School Registry

Status: GREEN

## Added

- OWNER/ADMIN-only student APIs;
- OWNER/ADMIN-only guardian APIs;
- student detail/update API;
- student-guardian linking;
- enrollment creation;
- academic session/class-arm lookup;
- 25-row student pagination;
- scoped registry search;
- `/login` school-admin sign-in screen;
- `/schools/[slug]/registry` protected School Registry UI.

## Database

Phase 2B adds no schema migration.

All four existing migrations must remain immutable.

## Integrity

Every registry request resolves current school authority and every query scopes by the resolved school ID.

Student and guardian records remain distinct from login identities.

Identity-card issuance remains deferred.
## ESLint recovery artifacts

CASA's .casa-backups directory contains immutable/recovery source snapshots and is not active application source.

ESLint flat config now globally ignores:

.casa-backups/**

This prevents historical failing snapshots from affecting current source verification while preserving the backup evidence.

The obsolete loadAcademicOptions callback was removed after the React effect lifecycle refactor because academic options are now fetched directly by the dedicated asynchronous effect.

No ESLint rule was disabled or suppressed.

## Live completion verification

- auth cryptographic self-test passed;
- TypeScript passed;
- ESLint passed;
- production build passed;
- unauthenticated registry request -> HTTP 401;
- OWNER login -> HTTP 200;
- OWNER student registry -> HTTP 200;
- OWNER guardian registry -> HTTP 200;
- OWNER academic options -> HTTP 200;
- protected /schools/casatestingowner/registry rendered successfully;
- verification session logged out;
- all four migrations remained unchanged;
- no verification student or guardian was inserted.
