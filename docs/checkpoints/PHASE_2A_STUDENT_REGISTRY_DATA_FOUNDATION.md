# CASA School Ã¢â‚¬â€ Phase 2A Student Registry Data Foundation

Status: GREEN

## Added domain tables

- `students`
- `guardians`
- `student_guardians`
- `student_enrollments`
- `student_identity_cards`

## Added enums

- `student_status`
- `student_sex`
- `guardian_status`
- `student_enrollment_status`
- `student_identity_card_status`

## Core invariants

- student records do not imply user accounts;
- every school-owned relationship is tenant-bound;
- guardian login membership is optional;
- one primary guardian per student;
- one active enrollment per student;
- ended enrollments require an end date;
- one active identity card per student;
- card QR/token plaintext is not stored, only a SHA-256 hash.

## Deferred

Phase 2A is the persistence foundation only.

Phase 2B will add tenant-authorized registry APIs and OWNER/ADMIN management workflows.
## Migration

Applied:

drizzle/20260827191914_student-registry-foundation/migration.sql

Verified development state:

- five student-domain tables;
- eight required tenant/identity constraints;
- three required partial unique indexes;
- four total Drizzle migrations;
- the existing Phase 1F school/OWNER data remained intact;
- all new student-domain tables remain empty;
- all previous migrations remained immutable.
