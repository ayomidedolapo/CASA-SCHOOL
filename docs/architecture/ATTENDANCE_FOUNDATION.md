# CASA School ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Attendance Foundation

## Verification model

CASA School follows:

**Scan ID ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Verify Face ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Verify Liveness ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Verify Time ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Record Attendance**

The ID card identifies the student.

Face verification verifies that the person presenting the card is the enrolled student.

Liveness helps protect the face step against presentation attacks.

The attendance record is written only after the verification pipeline reaches an accepted outcome.

## Attendance policy

`attendance_policies` defines a school-owned policy and validity period.

`attendance_policy_days` defines weekday-specific arrival windows in the school's configured timezone:

- check-in opens;
- on-time cutoff;
- check-in closes.

The database enforces window ordering.

Only one active default attendance policy may exist per school.

## Terminals

`attendance_terminals` represents registered attendance devices such as an Android tablet.

Each terminal has:

- school-scoped terminal code;
- 256-bit secret represented in PostgreSQL only by SHA-256 hash;
- status;
- provisioning school membership;
- last-seen timestamp.

Raw terminal credentials will be generated and returned only at provisioning time in Phase 3B.

## Sessions

`attendance_sessions` represents one school attendance day.

A school may have only one attendance session for a given date.

A session references the policy used for that day and has lifecycle:

- PLANNED;
- OPEN;
- CLOSED;
- CANCELLED.

## Verification attempts

`attendance_verification_attempts` is the immutable evidence trail for terminal attempts.

It records:

- school;
- attendance session;
- terminal;
- SHA-256 hash of the scanned card token;
- resolved student/card when known;
- card result;
- face result and confidence;
- liveness result and confidence;
- time result;
- final attempt outcome;
- machine-readable reason code;
- optional manual verifier;
- timestamps.

Failed, unknown-card, outside-window, face-failed, and manual-review attempts can therefore remain auditable without creating a student attendance record.

Confidence is represented as basis points from 0 to 10000 instead of floating-point values.

## Attendance records

`student_attendance_records` represents accepted attendance.

The database allows only one record per student per attendance session.

A record may be:

- ON_TIME;
- LATE;
- MANUAL.

An automated record may point to the verification attempt, terminal, and card used.

A manual record must identify the school membership that verified it.

## Tenant integrity

Every attendance relationship repeats `school_id`.

Composite foreign keys prevent a School A session, student, card, terminal, attempt, or staff membership from being attached to School B attendance data.

## Deferred

Phase 3A adds persistence rules only.

It does not yet implement:

- attendance policy admin API/UI;
- terminal provisioning API/UI;
- terminal authentication;
- QR scanning endpoint;
- face enrollment or matching;
- liveness provider integration;
- attendance session opening/closing;
- attendance reporting;
- parent notifications;
- offline terminal sync.

Those layers will build on this foundation rather than create parallel attendance data.
## Departure extension requirement

The Phase 3A schema was created before the final school-day sign-out requirement was locked.

The Scanner PWA must support both CHECK_IN and CHECK_OUT.

The next attendance migration will extend the existing foundation before terminal APIs are finalized. It will not create a separate competing attendance system.

Required behavior:

- normal CHECK_OUT after the configured dismissal time/window;
- face/liveness/card verification on departure;
- durable departure timestamp and terminal evidence;
- one completed departure per student/session unless an explicit re-entry workflow exists;
- early-departure staff override with reason/audit;
- guardian notification event after successful departure;
- notification delivery decoupled through durable outbox processing.

The student daily presence state should be derivable as:

`NOT_ARRIVED Ã¢â€ â€™ ON_CAMPUS Ã¢â€ â€™ SIGNED_OUT`

with explicit exception states for rejected attempts and authorized early departure.
## Phase 3B presence extension

The attendance foundation now models both CHECK_IN and CHECK_OUT.

Additive Phase 3B changes include:

- explicit verification-attempt operation;
- normal dismissal and departure-close windows;
- early/normal/manual departure result;
- ON_CAMPUS/SIGNED_OUT daily state;
- departure evidence on the attendance record;
- immutable accepted `student_presence_events`;
- school-specific WhatsApp sender identity;
- durable guardian-notification outbox.

The original Phase 3A migration remains immutable.