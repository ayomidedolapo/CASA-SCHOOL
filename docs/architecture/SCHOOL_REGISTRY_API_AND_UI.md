# CASA School â€” School Registry API & UI

## Authorization

All Phase 2B registry APIs call `requireSchoolRole(slug, ["OWNER", "ADMIN"])`.

Authentication alone is insufficient.

Every database query also scopes by the resolved `access.school.id`.

## API surface

- `GET/POST /api/schools/[slug]/registry/students`
- `GET/PATCH /api/schools/[slug]/registry/students/[studentId]`
- `GET/POST /api/schools/[slug]/registry/guardians`
- `POST /api/schools/[slug]/registry/students/[studentId]/guardians`
- `POST /api/schools/[slug]/registry/students/[studentId]/enrollments`
- `GET /api/schools/[slug]/registry/academic-options`

Student listing is paginated at 25 rows and supports scoped search by admission number and student name.

Guardian lookup is school-scoped and supports name/email/phone search.

## Neon HTTP boundary

CASA School currently uses Drizzle's Neon HTTP driver.

Phase 2B therefore avoids workflows that require an interactive transaction.

Each mutation is independently valid:

1. create student;
2. create guardian;
3. link guardian;
4. create enrollment.

The database constraints from Phase 2A remain the final integrity boundary.

If a future workflow requires a truly atomic multi-step business transaction, CASA will either use Neon HTTP batch semantics where appropriate or introduce the WebSocket/Postgres driver deliberately rather than assuming interactive transaction support.

## User interface

`/login` is the first CASA School authentication screen.

`/schools/[slug]/registry` is OWNER/ADMIN protected.

The registry UI provides:

- student search and list;
- guardian search and list;
- student creation;
- guardian creation;
- guardian linking;
- enrollment creation when academic options exist;
- current enrollment visibility;
- guardian/account distinction;
- clear empty states.

The UI intentionally states that a student record does not create a login account.

## Academic enrollment labels

Enrollment selectors use real academic labels:

- academic session name;
- class level name;
- class arm name.

Raw UUIDs are not exposed as the primary admin interaction.

## Identity cards

Identity-card issuance remains deferred to Phase 2C.

Phase 2B does not create, print, rotate, revoke, or expose raw card tokens.