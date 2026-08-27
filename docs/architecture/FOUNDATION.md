# CASA School Foundation

## Product boundary

CASA School is a separate production application for primary and secondary schools.

It must not share its application database with the CASA Institution workspace.

The CASA Motherboard may integrate with CASA School through explicit platform contracts later, but Motherboard integration is not a reason to weaken tenant or database isolation inside CASA School.

## Database rules

- PostgreSQL on Neon is the target database.
- Runtime access uses the Neon HTTP driver through Drizzle ORM.
- Schema changes use generated, reviewable SQL migrations.
- `drizzle-kit push` is not part of the CASA School production workflow.
- A new empty database must be reproducible from migration `0000` onward.
- No hidden/manual production-only schema changes are allowed.
- Production data is never used as a substitute for migration history.

## Environment rules

`DATABASE_URL` is server-only configuration.

Application compilation does not require a live database connection.

Routes that require the database obtain it lazily at runtime.

## Phase 1A scope

This phase establishes:

- dependency foundation;
- lazy database connection;
- runtime database configuration validation;
- migration tooling;
- application/database health reporting;
- repeatable typecheck/lint/build commands.

No school, student, guardian, staff, attendance, ID-card, terminal, face-verification, or authorization domain table is created in Phase 1A.
## Phase 1B

The first production domain migration establishes the school tenant boundary, global user identity, school membership/multi-role authority, and configurable academic structure.

See `docs/architecture/TENANCY_AND_IDENTITY.md`.

CASA School tenant child relationships must carry `school_id` and use database-enforced tenant-safe foreign keys where they reference another tenant-owned entity.
## Drizzle v1 migration format

CASA School uses the migration layout produced by the installed Drizzle v1 toolchain:

`drizzle/<timestamp>_<name>/migration.sql`

with `snapshot.json` stored beside the SQL.

The first committed migration directory is the schema baseline. The requirement is reproducible, ordered, immutable migration historyâ€”not a particular numeric filename prefix.