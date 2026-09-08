# CASA School — Branch Progression and Card Renewal

## One organization, many branches

A school group remains one CASA School organization and one tenant. Branches/campuses exist inside that organization.

The student's active enrollment determines the student's home branch through:

`Enrollment → Class Arm → Branch`

No duplicate student record is created when a student moves between branches.

## Progression review

A progression batch is scoped to one source branch and one source/target academic-session pair.

Every source student begins as `PENDING`. The system may expose one unambiguous next-class suggestion, but it does not silently commit that suggestion.

An authorized school administrator records one decision:

- `PROMOTED`
- `RETAINED`
- `TRANSFERRED`
- `GRADUATED`
- `WITHDRAWN`

A retained student remains at the same class level.

A promoted student moves forward in the configured Section/Class-Level ordering and remains inside the source branch.

A branch change must use `TRANSFERRED`. Cross-branch transfers require organization `OWNER` or `ADMIN` authority; Branch Admin alone cannot move a student into another branch.

## Confirmation

A draft batch may be reviewed before the session ends, but confirmation is blocked until the source academic session has ended.

Confirmation also requires every student to have a non-PENDING decision.

The confirmation statement is atomic. It closes each source enrollment, creates the next-session enrollment for continuing students, updates graduated/withdrawn student lifecycle state, creates renewal items, and only then confirms the batch. An integrity guard aborts the complete SQL statement if the expected row counts no longer match because of a concurrent state change.

## Renewal batches

There is one renewal batch per organization + target academic session.

This means several branches may contribute renewal items into the same organization/session batch while still keeping each item tied to its destination branch and section.

Renewal reason during session progression:

- same class arm, new session → `SESSION_CHANGE`
- changed class arm, new session → `CLASS_AND_SESSION_CHANGE`

The schema also retains `CLASS_CHANGE` for an in-session class change workflow.

## CASA production workbook

CASA Technical can retrieve the renewal batch through the existing internal card-production trust boundary.

The XLSX is one workbook for the organization/session. It contains:

- a Summary sheet;
- one worksheet per Branch + Section;
- student identity references used by CASA operations;
- destination class;
- renewal reason;
- current production-job status and ID.

The workbook is planning/production coordination data. It does not change the minimal visible student-card design.

## Next guarded integration

This backend pass deliberately does not render renewal cards itself.

The next guarded pass will connect renewal items to the existing secure central card-production engine so the raw QR credential remains server-memory only and existing Passkey/card lifecycle rules are not weakened.

Attendance integration is also separate: branch terminal scope, holidays/non-instructional dates, and active excused leave will be wired into the attendance state machine before Staging promotion.
