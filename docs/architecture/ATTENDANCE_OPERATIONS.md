# CASA School Ã¢â‚¬â€ Attendance Operations & Supervised Exceptions

## Scope

Phase 3I turns the attendance foundation into a daily school operating surface.

The Scanner remains the student-facing terminal.

`/schools/[slug]/attendance` is the human attendance-operations surface.

## Roles

OWNER and ADMIN may:

- create a new attendance policy version;
- open today's attendance session;
- close today's attendance session;
- authorize an early departure with Passkey;
- view all Today attendance state.

SCHOOL_TECHNICIAN may view Today attendance and terminal health, work branch-by-branch, and authorize early departure with a mandatory reason + Passkey.

A Branch Admin may authorize early departure only inside a branch they are actively assigned to.

SCHOOL_TECHNICIAN still may not change attendance policy or daily-session state. General STAFF is not granted broad early-release authority.

## Policy versioning

Attendance policy is not edited in place through Phase 3I.

A schedule change creates a new `attendance_policies` row and weekday rows.

When the new policy is default, the previous active default loses only its default flag.

Historical attendance sessions keep their original `policy_id`.

## Today session

A school attendance date has at most one `attendance_sessions` row.

`Open today` resolves the school-local date and weekday, resolves the active default policy valid for that date, requires a weekday rule, creates/opens today's session, and appends CREATED/OPENED audit events.

`Close today` only closes an OPEN session and appends a CLOSED event.

## Today state

Expected students come from an ACTIVE student with an ACTIVE enrollment whose effective dates include the school-local date.

State is derived from the accepted attendance record:

- no record before check-in close Ã¢â€ â€™ NOT_ARRIVED;
- no record after check-in close Ã¢â€ â€™ ABSENT;
- record with ON_CAMPUS Ã¢â€ â€™ ON_CAMPUS;
- record with SIGNED_OUT Ã¢â€ â€™ SIGNED_OUT.

Arrival classification remains separate: ON_TIME, LATE, or MANUAL.

## Supervised early departure

1. Student scans CASA card at the Scanner.
2. Server resolves CHECK_OUT.
3. Policy classifies it EARLY.
4. Attempt remains PENDING with `EARLY_DEPARTURE_AUTH_REQUIRED`.
5. Scanner pauses.
6. OWNER/ADMIN enters a mandatory reason in Attendance Operations.
7. Staff performs the existing `EARLY_DEPARTURE` Passkey step-up.
8. CASA consumes that exact one-use grant and stores its grant ID on the append-only early-departure authorization.
9. Authorization is bound to school, student, attendance record, pending attempt, authorizing membership, Passkey grant, reason, and time.
10. Scanner polls only the same authenticated terminal attempt.
11. After authorization, Scanner automatically resumes face+liveness.
12. Trusted biometric success finalizes SIGNED_OUT.

The Scanner never receives the human Passkey token or private release reason.

## Early-departure finalization

Acceptance requires the same terminal attempt, ON_CAMPUS record, current student, authorization row, consumed EARLY_DEPARTURE grant, authorizing membership, nonblank reason, ACTIVE biometric profile, and trusted face+liveness assertion.

Successful finalization stores EARLY departure, check-out terminal/card/attempt, authorizing membership, reason, biometric evidence, and an immutable CHECKED_OUT presence event.

## Guardian notification

Successful early departure emits `STUDENT_EARLY_DEPARTURE` through the existing durable school WhatsApp outbox when an ACTIVE school sender and eligible guardian destination exist.

Attendance does not depend on WhatsApp provider availability.

Today Operations surfaces accepted sign-outs with no guardian outbox row.

## Session audit

`attendance_session_events` is append-only evidence for CREATED, OPENED, and CLOSED.

## Passkey split

Student attendance uses terminal credential + card + face + liveness + time.

Early release uses logged-in OWNER/ADMIN + EARLY_DEPARTURE Passkey grant + reason.

## Frontend discipline

Phase 3I adds only the dedicated Attendance Operations surface needed to run attendance.

It does not redesign the broader School Admin application.

The surface follows CASA's restrained editorial direction: oversized state typography, monochrome/neutral palette, thin rules, dense operational tables, and minimal controls.
## React effect recovery

Phase 3I source verification stopped at `react-hooks/set-state-in-effect`.

An initial recovery added a microtask boundary inside `refreshToday()`, but the React lint rule still correctly rejected invoking that state-updating refresh function directly from the effect body.

The final recovery changed the effect itself: the first refresh is scheduled through `window.setTimeout`, while recurring refresh stays inside `window.setInterval`. The effect body now only manages external timer synchronization.

The lint rule remains enabled and no suppression or React configuration relaxation was introduced.

## Selected-student early departure

For known early releases, the operator may choose multiple students who are currently ON_CAMPUS in one branch, even when they belong to different classes.

The operator enters one reason and completes one EARLY_DEPARTURE Passkey step-up. CASA stores an individual durable preauthorization for every selected student. Each student must still scan their own ACTIVE card and pass face+liveness. The first valid early scan consumes that student-specific preauthorization and binds it to the exact Scanner attempt.

This avoids repeated Passkey prompts for a known group without creating a class-wide or branch-wide blanket dismissal.

## Departure close

After the configured check-out close time, the Scanner remains installed/running but ordinary attendance scans are rejected with `CHECK_OUT_WINDOW_CLOSED`. The daily attendance session remains an explicit administrative OPEN/CLOSED lifecycle.
