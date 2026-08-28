# CASA School Ã¢â‚¬â€ Phase 3B Presence Lifecycle & School Messaging Foundation

Status: GREEN

## Presence

- explicit CHECK_IN / CHECK_OUT attempts;
- normal dismissal time;
- departure close time;
- EARLY / NORMAL / MANUAL departure result;
- ON_CAMPUS / SIGNED_OUT daily presence state;
- immutable accepted student presence events;
- one accepted CHECKED_IN and one accepted CHECKED_OUT event per attendance record;
- early departure requires authorized school membership + reason.

## Messaging

- school-specific WhatsApp sender identity;
- sender must be ACTIVE before future delivery;
- provider IDs stored, raw provider secrets deliberately excluded;
- durable guardian-notification outbox;
- outbox is school/guardian/presence-event/sender scoped;
- retry/delivery fields prepared;
- duplicate guardian delivery prevented by database uniqueness.

## Frontend

No visual frontend work is included.

Scanner PWA and School Admin messaging setup UI remain later phases.
## Migration

Applied:

drizzle/20260828015513_presence-school-messaging/migration.sql

Verified:

- eight total Drizzle migrations;
- three Phase 3B tables;
- twelve attendance extension columns;
- sixteen required school-scoped foreign keys;
- zero presence, sender, outbox, attempt, or attendance records manufactured;
- all seven earlier migrations remained immutable;
- attendance presence self-test passed;
- auth/card self-tests, typecheck, lint, and build passed.
