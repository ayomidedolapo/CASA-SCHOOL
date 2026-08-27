# CASA School â€” Student Registry, Guardians, Enrollment, and Identity

## Student records are not login accounts

`students` is the authoritative school-owned student record.

A student record does not require a row in `users` and does not automatically create a login identity.

This supports primary-school deployments where children may never sign into CASA directly.

Future student-account support must link explicitly rather than making student identity dependent on authentication.

## Tenant safety

Every student-domain table carries `school_id`.

Relationships between school-owned entities use composite foreign keys such as:

- `(school_id, student_id)` -> `students(school_id, id)`
- `(school_id, guardian_id)` -> `guardians(school_id, id)`
- `(school_id, academic_session_id)` -> `academic_sessions(school_id, id)`
- `(school_id, class_arm_id)` -> `class_arms(school_id, id)`

This prevents a row belonging to School A from referencing a child, guardian, session, or class belonging to School B even if application logic is incorrect.

## Guardians

A guardian can exist without a CASA login.

If a guardian later receives portal access, the guardian record can point to a school membership through `(school_id, membership_id)`.

The database therefore keeps the real-world guardian relationship separate from account provisioning.

Each guardian must have at least one contact method: email or phone.

## Student-guardian relationship

`student_guardians` stores relationship-specific properties rather than putting them on the guardian record:

- relationship label;
- primary guardian;
- emergency contact;
- pickup authorization;
- notification eligibility.

A student can have multiple guardians.

A partial unique index allows at most one primary guardian per student.

## Enrollment

`student_enrollments` is historical rather than a mutable `class_id` field on `students`.

Each record binds a student to:

- school;
- academic session;
- class arm;
- effective dates;
- lifecycle status.

Only one ACTIVE enrollment may exist for a student at a time.

Closing, withdrawing, or transferring an enrollment requires an end date.

This preserves class history and gives future attendance/reporting a reliable period-aware source of truth.

## School-issued identity cards

`student_identity_cards` provides the school-issued ID-card record used later by attendance terminals.

CASA follows the rule:

**The ID card identifies the student. The face verifies the person.**

The QR/card payload will contain a cryptographically random opaque token.

CASA stores only the SHA-256 hash of that token in `token_hash`.

The raw token is not persisted in PostgreSQL.

This means a database read does not reveal printable/cloneable card tokens.

Each student may have only one ACTIVE card at a time, while LOST, REVOKED, REPLACED, and EXPIRED cards remain as history.

## Deferred intentionally

Phase 2A does not yet implement:

- registry CRUD API;
- student/guardian admin UI;
- card token generation/printing;
- student photographs;
- biometric/face templates;
- liveness;
- attendance;
- parent portal account provisioning.

Those layers will use this tenant-safe data foundation rather than inventing parallel identity records.