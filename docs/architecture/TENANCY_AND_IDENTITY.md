# CASA School â€” Tenancy and Identity Boundary

## Core rule

Every school-owned record belongs to exactly one school.

Tenant isolation must be enforced in both application queries and PostgreSQL relationships. Application filtering alone is not sufficient protection.

## School

`schools` is the root tenant table.

A school has:

- a stable UUID;
- a unique URL-safe slug;
- a lifecycle status;
- an IANA timezone, defaulting to `Africa/Lagos`.

The default timezone is only a starting value. Attendance and reporting must use the school's configured timezone.

## Global user identity

`users` represents a person who can authenticate to CASA School.

A user may belong to more than one school, so the user record does not contain `school_id`.

At least one normalized identity address is required:

- lower-case email; or
- E.164 phone number.

Authentication credentials are deliberately not modeled in Phase 1B. Password, Passkey, OTP, session, recovery, and other credential semantics belong to the authentication phase.

## School membership

`school_memberships` joins a global user to a school.

There can be only one membership row for the same user and school.

Membership lifecycle is separate from the global user's lifecycle. A user can leave one school without disabling their identity at another school.

## Multi-role authority

Roles are stored in `school_membership_roles`, not as one role column on `users`.

A membership can therefore hold multiple roles when the real workflow requires it.

Initial actor categories:

- `OWNER`
- `ADMIN`
- `STAFF`
- `GUARDIAN`
- `STUDENT`

These are not yet the final permission matrix.

Primary-school students do not need user accounts merely because `STUDENT` exists as an available membership role. Student records and optional student accounts are separate concepts.

## Database-enforced tenant relationships

Tenant child tables repeat `school_id` and use composite foreign keys to the parent entity's `(school_id, id)` identity.

Examples:

- a term references `(school_id, academic_session_id)`;
- a class level references `(school_id, section_id)`;
- a class arm references `(school_id, class_level_id)`;
- a membership role references `(school_id, membership_id)`.

This prevents a row owned by School A from pointing to a parent row owned by School B even when application code is wrong.

Future student, guardian, enrollment, ID-card, terminal, attendance, verification, and audit relationships should follow this rule where a tenant-owned child references another tenant-owned entity.

## Academic structure

The foundation does not hard-code labels such as Nursery, Primary, JSS, or SSS into enums.

Schools configure:

`School -> Section -> Class Level -> Class Arm`

A school that does not need sections can use class levels without a section.

Academic sessions and terms are school-scoped and have explicit lifecycle states.

## What Phase 1B intentionally does not model

- authentication credentials;
- authorization capabilities;
- student registry;
- guardians and parent-child links;
- enrollment history;
- ID cards and QR secrets;
- face templates;
- attendance rules;
- attendance terminals;
- attendance events;
- manual verification;
- audit logs;
- Motherboard integration.