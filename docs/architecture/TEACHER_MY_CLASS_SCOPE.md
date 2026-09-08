# CASA School — Teacher My-Class Scope

## Principle

`STAFF` is a broad school membership role. It is **not** sufficient authority to read a class roster or student attendance analytics.

Teacher access requires both:

1. an authenticated ACTIVE `STAFF` school membership; and
2. an ACTIVE `school_teacher_class_assignments` record for the requested academic session and class arm.

## Assignment lifecycle

Assignments are academic-session scoped.

OWNER or ADMIN can activate/deactivate an assignment through:

`GET/POST /api/schools/[slug]/teacher-assignments`

The assignment stores the assigning membership and, when revoked, the revoking membership and timestamp. This preserves who granted and removed the current capability without creating a competing staff-role system.

## Teacher APIs

- `GET /api/schools/[slug]/teacher/classes`
- `GET /api/schools/[slug]/teacher/classes/[classArmId]/attendance/today`
- `GET /api/schools/[slug]/teacher/classes/[classArmId]/students/[studentId]/attendance-analytics?sessionId=&termId=`

The Today endpoint reuses `getTodayAttendanceOperations`. The existing service gains optional `classArmId` and `academicSessionId` filters; existing organization-wide and branch-wide callers omit them and retain their current behavior.

The analytics endpoint reuses `getStudentAttendanceAnalytics`, including the existing calendar/excuse semantics, attendance percentage, punctuality percentage, and trend.

## Scope guarantees

A teacher cannot:

- read another class merely because they have the STAFF role;
- request a student outside the assigned class/session;
- use a revoked assignment;
- use a class not mapped to an ACTIVE branch.

## Report cards

Report-card writing is explicitly out of scope.

Teacher My-Class exposes objective attendance and punctuality information. It does not write, prepare, publish, or mutate report cards.
