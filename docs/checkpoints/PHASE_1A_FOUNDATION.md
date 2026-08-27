# CASA School â€” Phase 1A Foundation

Status: applied locally; final verification is performed by the installer after writes.

## Added

- Neon HTTP + Drizzle ORM foundation
- lazy server-side database creation
- DATABASE_URL validation
- Drizzle migration configuration
- `/api/health`
- `typecheck`, `check`, and database npm scripts
- `.env.example`
- architecture foundation record

## Deliberately not added

- school/tenant tables
- users/authentication
- roles/permissions
- students/guardians
- ID-card records
- biometric records
- attendance tables
- terminal records
- Motherboard integration

Those are blocked until the production invariants for tenancy and identity are explicitly modeled.

## Verification

Run:

```powershell
npm run typecheck
npm run lint
npm run build
```

A database URL is not required for these three commands.

Database migration commands require a real `DATABASE_URL` in `.env.local` or the process environment.