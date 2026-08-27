# CASA School Ã¢â‚¬â€ Phase 1F First Owner & Auth E2E

Status: GREEN

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
## Verified live flow

1. unauthenticated school access -> HTTP 401;
2. wrong password -> HTTP 401;
3. correct OWNER login -> HTTP 200 + session cookie;
4. /api/auth/session -> authenticated user;
5. /api/schools/casatestingowner/access -> active membership + OWNER role;
6. logout -> session revoked;
7. protected school access after logout -> HTTP 401;
8. FIRST_OWNER_PROVISIONED, LOGIN_FAILURE, LOGIN_SUCCESS, and LOGOUT events recorded.

## Database state

The development environment now contains the first real CASA School and first OWNER identity.

No migration was added or modified in Phase 1F.
