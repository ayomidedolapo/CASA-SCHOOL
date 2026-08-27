# CASA School Ã¢â‚¬â€ Phase 1F First Owner & Auth E2E

Status: installer in progress until end-to-end verification completes.

## Purpose

Prove the first real CASA School identity flow before student-domain work begins.

## Scope

No schema change is introduced in Phase 1F.

Phase 1F adds:

- authenticated school-access endpoint;
- deliberate first-school/OWNER provisioning;
- live HTTP authentication verification;
- live session-cookie verification;
- live OWNER-role resolution;
- live logout/session-revocation verification;
- auth-event verification.

## Protected endpoint

`GET /api/schools/[slug]/access`

The endpoint resolves current authenticated identity, current active school membership, and current roles from PostgreSQL.

It returns:

- HTTP 401 when no valid session exists;
- HTTP 403 when the authenticated user does not have active access to the requested school;
- school/membership/role context when access is valid.

## Data rule

First-owner provisioning is permitted only from an empty school/user database.

A recovery rerun may continue when exactly one school, one user, one OWNER role, and one password credential already exist.
## Recovery note â€” login rate limiter

The first live wrong-password test exposed a PostgreSQL expression-typing issue in the `auth_rate_limits` upsert.

`blocked_until` is `timestamp with time zone`. In the `CASE` expression, the bound JavaScript `Date` parameter did not receive enough PostgreSQL type context and was inferred as text.

The runtime query now casts that bound parameter explicitly:

`${blockedUntil}::timestamptz`

No database schema or migration change was required.

A disposable database-backed test verified that:

- a new identifier is allowed;
- one failed attempt remains allowed;
- the fifth failed attempt creates the temporary block;
- `Retry-After` state is positive;
- the disposable limiter row is removed afterward.