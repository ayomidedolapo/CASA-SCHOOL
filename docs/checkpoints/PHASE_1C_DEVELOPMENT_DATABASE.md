# CASA School â€” Phase 1C Development Database Bootstrap

Status: GREEN

## Environment

CASA School is connected locally to the dedicated Neon development database.

Safe connection metadata:

- host: ep-tiny-dew-a5dfzjhz-pooler.us-east-2.aws.neon.tech
- database: neondb
- credentials are stored only in .env.local and are not recorded in this checkpoint.

## Initial migration

Applied migration:

drizzle/20260827143258_school-foundation/migration.sql

The matching snapshot.json was preserved unchanged.

## Verified after migration

- all nine Phase 1B tables exist;
- the four tenant-safe composite foreign-key constraints exist;
- the Drizzle migration log exists;
- at least one applied migration is recorded;
- application typecheck passes;
- ESLint passes;
- production build passes;
- no production or staging database was configured or modified by this installer.

## Development rule

Local CASA School development uses the development Neon connection stored in .env.local.

Future schema changes must use:

1. schema source change;
2. drizzle-kit generate;
3. review generated SQL and snapshot;
4. apply to development with drizzle-kit migrate;
5. verify;
6. promote deliberately to later environments.

drizzle-kit push is not part of the CASA School production migration workflow.