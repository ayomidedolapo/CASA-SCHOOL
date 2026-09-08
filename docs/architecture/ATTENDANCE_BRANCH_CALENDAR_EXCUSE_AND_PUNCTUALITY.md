# CASA School — Branch Attendance, Calendar Exclusions, Excused Leave, and Punctuality

## Trust sequence

The attendance trust boundary remains:

`Terminal credential → Student card → Branch scope → Face/liveness → Time → Attendance`

The ID card identifies the student. The face verifies the person. A QR scan alone still cannot create accepted attendance.

## Branch enforcement

Every terminal is mapped to one school branch through `school_branch_terminals`.

The student's branch for an attendance date is resolved from the enrollment effective on that attendance-session date:

`Enrollment → Class Arm → Branch`

Before biometrics begin, CASA rejects a matched card when:

- the terminal has no branch assignment;
- the student's enrollment has no branch mapping for that date;
- either branch is inactive;
- the student's branch differs from the terminal branch;
- a normal CHECK_IN occurs on a school/branch non-instructional date.

The same scope is re-resolved before trusted biometric finalization. This closes the configuration-change/TOCTOU gap between scan and final attendance write.

## Calendar behavior

The following calendar events are non-instructional for normal attendance grading:

- PUBLIC_HOLIDAY
- SCHOOL_BREAK
- BRANCH_CLOSURE
- SPECIAL_NON_INSTRUCTIONAL_DAY

A school-wide event applies to all branches. A branch event applies only to that branch.

A calendar change never strands a student already on campus: a non-instructional event blocks normal CHECK_IN, but does not by itself block CHECK_OUT.

## Excused leave

An ACTIVE attendance excuse prevents a no-show from becoming an ordinary absence.

If the student actually attends during an excused period, the real attendance record wins. CASA does not discard a trusted attendance record merely because leave was approved.

## Today operations

Today attendance now carries branch scope and three exclusion states:

- EXCUSED
- NON_INSTRUCTIONAL
- BRANCH_UNASSIGNED

Physical presence still wins for safety: if an excluded student actually has a trusted record, ON_CAMPUS or SIGNED_OUT remains visible while the exclusion is retained for normal attendance/punctuality denominators.

The existing school-wide Today route remains available to its existing attendance operators and accepts an optional `branchId` filter.

A Branch Admin scoped route is also available:

`GET /api/schools/[slug]/branches/[branchId]/attendance/today`

## Student analytics

Branch-scoped student analytics are available at:

`GET /api/schools/[slug]/branches/[branchId]/students/[studentId]/attendance-analytics?academicSessionId=<uuid>&academicTermId=<optional-uuid>`

The response contains:

- objective attendance percentage;
- objective punctuality percentage;
- on-time attendance rate;
- ON_TIME / LATE / MANUAL / ABSENT / EXCUSED / NON_INSTRUCTIONAL / PENDING counts;
- early-departure count;
- daily trend points;
- running attendance percentage;
- running punctuality percentage.

### Attendance percentage

`(ON_TIME + LATE + MANUAL) / (ON_TIME + LATE + MANUAL + ABSENT) × 100`

EXCUSED, NON_INSTRUCTIONAL, and PENDING days are outside the denominator.

### Punctuality percentage

`ON_TIME / (ON_TIME + LATE) × 100`

MANUAL is deliberately excluded because manual attendance proves presence but does not prove an on-time arrival.

### On-time attendance rate

CASA also exposes:

`ON_TIME / eligible instructional days × 100`

This is useful for trend analysis but is not the same metric as punctuality percentage.

## Punctuality grading

CASA does not hard-code a universal A/B/C punctuality grade.

Schools may grade punctuality differently. The backend therefore exposes the objective percentage and trend. If product testing confirms a need for grade labels or marks, thresholds should be school-configurable rather than globally invented.
