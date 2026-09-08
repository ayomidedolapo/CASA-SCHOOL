# CASA School — Attendance Readiness & Card Replacement

## Attendance Go-Live

Student registration, face enrollment, card production, and attendance activation are separate lifecycles.

Attendance uses:

`SETUP -> READY -> ACTIVE -> PAUSED`

No attendance session may be opened until attendance is ACTIVE and the configured effective start date has arrived.

Marking attendance READY requires an active default attendance policy with at least one configured weekday.

Activation defaults to the next instructional school date. Starting on the current school-local date requires explicit confirmation. A holiday or other non-instructional calendar date cannot be selected as the effective date.

Pausing attendance is blocked while an attendance session remains OPEN.

## Instructional dates

Instructional dates come from the active default attendance policy weekday plus the existing school calendar exclusions.

Saturday and Sunday are not hard-coded as holidays. If a school policy includes Saturday and no calendar exclusion applies, Saturday is instructional.

## Lost card and replacement

Reporting a card lost:

1. changes the old ACTIVE card to LOST immediately;
2. appends the existing MARKED_LOST identity-card lifecycle event;
3. creates one CARD_REPLACEMENT_PENDING case for the student;
4. does not change enrollment or biometric identity.

The pending replacement case is the authoritative operational replacement queue marker. A formal replacement request is recorded with its own timestamp and actor.

## Three-instructional-day grace

Before a formal replacement request:

- grace is counted in instructional school dates, not raw calendar days;
- days 1–3 permit a supervised card-replacement attendance exception;
- day 4 and later reject the technician/admin exception with CARD_REPLACEMENT_GRACE_EXPIRED.

Once the formal replacement request has been recorded, the supervised exception remains available while the case is pending so the student is not punished for production delay.

## Supervised arrival

The School Technician, OWNER, or ADMIN may use the card-replacement exception only for a student with a pending replacement case and an OPEN instructional attendance session.

Verification method:

- FACE_EXISTING_PROFILE — requires the student's existing ACTIVE biometric profile. There is no identity-only bypass in the card-replacement attendance exception.

An accepted exception records:

- physical attendance as MANUAL and ON_CAMPUS;
- verified_by_membership_id;
- a CHECKED_IN presence event;
- a first-class student_card_attendance_exceptions row;
- a guardian STUDENT_CHECKED_IN outbox notification when the school has an active messaging sender and eligible guardian.

The guardian message explicitly states that arrival used the card-replacement exception.

## Attendance vs card compliance

Physical attendance is not falsified because a card is unavailable.

Card compliance is reported separately:

`card-confirmed attended days / total attended days`

A supervised replacement exception therefore lowers card-compliance performance without converting genuine presence into absence.

If the three-day grace expires without a formal replacement request, the supervised exception is locked. With no attendance record, normal Today logic can classify the student absent after the arrival window closes.

## Scanner trust boundary

This exception does not weaken the normal Scanner trust chain:

`Terminal credential -> Student card -> Branch scope -> Face/liveness -> Time -> Attendance`

The supervised exception is a separate school-operator path and does not create or fake terminal/card/biometric verification evidence.

## Deferred production hardening

The replacement case is the first-class queue marker in this foundation. Linking it to a production job and introducing a READY_FOR_ACTIVATION replacement-card state remain separate card-production lifecycle hardening; this foundation does not silently activate a produced replacement card.
