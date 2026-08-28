# CASA School Ã¢â‚¬â€ Phase 3A Attendance Foundation

Status: GREEN

## Added tables

- `attendance_policies`
- `attendance_policy_days`
- `attendance_terminals`
- `attendance_sessions`
- `attendance_verification_attempts`
- `student_attendance_records`

## Core rules

- school-local weekday arrival windows;
- one active default attendance policy per school;
- one attendance session per school/date;
- terminal credentials stored only as SHA-256 hashes;
- card scans stored only as SHA-256 token hashes;
- face/liveness confidence stored as 0..10000 basis points;
- successful card resolution requires student and card identity;
- one accepted attendance record per student/session;
- manual attendance requires an acting membership;
- all cross-school links are protected by composite foreign keys.

## Verification sequence

Scan ID Ã¢â€ â€™ Verify Face Ã¢â€ â€™ Verify Liveness Ã¢â€ â€™ Verify Time Ã¢â€ â€™ Record Attendance

Phase 3A adds persistence only; no attendance terminal API or biometric matching is exposed yet.
## Migration

Applied:

drizzle/20260828003838_attendance-foundation/migration.sql

Verified development state:

- six attendance tables;
- six total Drizzle migrations;
- fourteen required school-scoped attendance foreign keys;
- two required partial unique indexes;
- zero attendance policy, terminal, session, attempt, or record rows created;
- all five earlier migrations remained immutable.
