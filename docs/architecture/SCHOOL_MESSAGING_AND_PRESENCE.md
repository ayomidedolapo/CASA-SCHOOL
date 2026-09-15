# CASA School ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Presence Lifecycle & School Messaging

## Daily presence

CASA School tracks both arrival and departure.

The normal state machine is:

`NOT_ARRIVED ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ ON_CAMPUS ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ SIGNED_OUT`

The accepted verification sequence for both directions remains:

**Scan ID ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Verify Face ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Verify Liveness ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Verify Time ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Record Presence Event**

`attendance_verification_attempts.operation` distinguishes:

- `CHECK_IN`
- `CHECK_OUT`

A student cannot have a valid normal check-out unless an accepted attendance record already places the student `ON_CAMPUS`.

## Arrival

Arrival uses the existing school weekday policy:

- check-in opens;
- on-time cutoff;
- check-in closes.

Accepted arrival remains ON_TIME, LATE, or MANUAL.

## Departure

Each weekday policy additionally defines:

- normal dismissal time;
- check-out close time.

A check-out before normal dismissal is EARLY.

A normal Scanner PWA flow must not accept an EARLY departure without a school-authorized membership and nonblank reason.

Normal departure changes the daily attendance record to `SIGNED_OUT`.

The system retains:

- departure timestamp;
- terminal;
- card;
- verification attempt;
- departure classification;
- optional acting membership;
- early-departure reason where applicable.

## Immutable presence events

`student_presence_events` is the immutable accepted-presence trail.

A daily attendance record may have at most:

- one `CHECKED_IN` event;
- one `CHECKED_OUT` event.

This prevents duplicate normal check-in/check-out while leaving rejected verification attempts in `attendance_verification_attempts`.

Re-entry after final sign-out is deliberately deferred and must be an explicit workflow rather than silently creating a second check-in.

## School-owned WhatsApp identity

Guardians should perceive attendance messages as coming from their child's school.

CASA provides the automation engine, but it does not spoof arbitrary WhatsApp numbers.

Each school must have a WhatsApp Business sender that is properly onboarded with the messaging provider.

`school_whatsapp_senders` stores the non-secret school/provider identity:

- school;
- display phone number;
- verified display name;
- provider business-account ID;
- provider phone-number ID;
- opaque provider-connection reference;
- lifecycle status.

CASA must not store provider access tokens, registration PINs, or comparable raw secrets in this table.

Secrets belong in the deployment secret-management layer.

Only an ACTIVE sender may be used for guardian delivery.

The school-facing setup will later use a provider-supported onboarding flow such as WhatsApp Embedded Signup rather than treating a typed phone number as proof that CASA can legally/technically send from it.

## Guardian message example

After a successful normal departure:

`Dolapo Ayomide has checked out of school for the day.`

The final template wording may be school-configurable within CASA and must comply with provider template requirements.

## Durable notification outbox

Attendance completion must never depend on WhatsApp being available at the same moment.

`school_notification_outbox` stores one intended delivery per:

- accepted presence event;
- eligible guardian;
- active school sender.

The row snapshots:

- recipient phone;
- event type;
- template key;
- render payload;
- retry/delivery state.

The database uniqueness rule prevents the same accepted presence event from being queued twice to the same guardian from the same school sender.

A worker introduced later will claim PENDING/RETRY rows, deliver them through the school's connected WhatsApp sender, persist provider message IDs, and retry transient failures.

## Guardian selection

When check-in/check-out APIs are implemented, recipients must come from the existing school-scoped student/guardian relationship and respect `receivesNotifications`.

A guardian without a usable phone number cannot receive WhatsApp and should be surfaced as an operational exception rather than fabricating a destination.

## Early-departure notification

An authorized early departure should emit `STUDENT_EARLY_DEPARTURE`, allowing the guardian message to clearly distinguish early collection/release from normal dismissal.

## Scanner PWA

The Scanner remains a separate installable PWA bound to one provisioned school terminal.

The terminal UI is not the School Admin application.

The next terminal phase will implement:

- terminal provisioning/authentication;
- active-session resolution;
- QR credential resolution;
- CHECK_IN endpoint;
- CHECK_OUT endpoint;
- atomic presence event + attendance summary updates;
- atomic guardian outbox creation;
- replay/idempotency protections.

Face/liveness provider integration remains a separate biometric layer.
## Phase 3C Scanner trust boundary

The Scanner backend now authenticates provisioned terminals, resolves the school-local OPEN session, securely resolves CASA card hashes, and creates idempotent pending verification attempts.

QR scans alone still cannot create CHECK_IN/CHECK_OUT attendance.

Accepted presence events and guardian notifications remain downstream of trusted biometric/liveness finalization.
## Phase 3D verified presence

Normal departure now queues guardian delivery only after trusted face + liveness evidence has atomically moved the student to SIGNED_OUT.

The outbox uses the school's ACTIVE WhatsApp sender.

A missing/inactive sender does not invalidate attendance; it produces no delivery row and will be surfaced later as an operational messaging exception.

Early departure stays Passkey-gated.
## Phase 3I early release

EARLY CHECK_OUT has a supervised production path.

The student remains at the Scanner while OWNER/ADMIN records the reason and consumes an `EARLY_DEPARTURE` Passkey grant.

The same pending terminal attempt then resumes trusted face+liveness verification.

Accepted early departure records the staff actor + reason and queues `STUDENT_EARLY_DEPARTURE` instead of the normal sign-out notification event.