# CASA School — SimHostNG SMS Delivery

## Current product decision

Guardian attendance notifications use SimHostNG SMS. The previously prepared Meta WhatsApp transport is shelved and remains dormant so it can be restored in a future product wave.

Attendance remains authoritative even when SMS is unavailable. Notification delivery continues through the durable `school_notification_outbox`.

## Provider runtime

The server-side runtime uses:

- `CASA_SMS_PROVIDER_MODE=SIMHOSTNG`
- `CASA_SIMHOSTNG_API_KEY`
- `CASA_SIMHOSTNG_SERVER_ID`
- `CASA_SIMHOSTNG_SIM_SLOT` (`1` or `2`)
- optional `CASA_SMS_DEFAULT_COUNTRY_CODE` (defaults to `234`)
- optional `CASA_SMS_MAX_ATTEMPTS` (defaults to `6`)
- `CRON_SECRET` for the internal delivery job.

Provider secrets are never entered by School Admins, returned by the Messaging API, or persisted into school-owned database rows.

The outbound request is an `application/x-www-form-urlencoded` POST to `https://simhostng.com/api/sms` with `apikey`, `server`, `sim`, `number`, `message`, and `ref`.

A provider response of `Ok` is treated as accepted delivery. CASA persists the provider/reference ID and retains bounded retry state for transient failures.

## School-owned message identity

School Admins may configure only:

- school display name, maximum 40 characters;
- one optional note, maximum 40 characters;
- whether guardian SMS is enabled.

CASA inserts the student name and event time from the durable attendance notification payload and formats time in the school's configured timezone.

Examples:

`CASA School: Tobi Adeyemi checked in at 7:42 AM. Have a great school day. CASA - Do not reply.`

`CASA School: Tobi Adeyemi checked out at 3:18 PM. CASA - Do not reply.`

The footer intentionally uses ASCII punctuation. The UI warns Admins that long or Unicode-heavy messages can be split by a carrier into multiple billable SMS segments.

## Compatibility storage

No schema migration is introduced in this source wave.

The existing `school_whatsapp_senders` table is temporarily reused as the school notification-channel identity table so existing atomic attendance -> guardian-outbox creation continues unchanged.

A SimHostNG compatibility row is identified by:

- `provider_connection_ref = SIMHOSTNG_DEFAULT`
- `display_phone_number = SimHostNG SMS`
- a school-unique synthetic `provider_phone_number_id`
- `verified_name` = Admin-configured school display name
- `provider_business_account_id` = short Admin note, or `__NONE__`
- `status = ACTIVE` when SMS is enabled.

This is deliberate compatibility debt. If WhatsApp is restored later, CASA should migrate the sender model to a provider-neutral notification-channel table rather than sharing this compatibility row.

## WhatsApp dormant state

The Meta provider and webhook source remain byte-for-byte preserved in this wave. The old internal WhatsApp outbox job returns HTTP 410 and cannot dispatch notifications.

## Delivery isolation

The SMS worker claims only outbox rows linked to `SIMHOSTNG_DEFAULT`, uses `FOR UPDATE ... SKIP LOCKED`, preserves the existing processing lease/retry model, and never blocks attendance completion on provider availability.


## Attendance recipient rule

A student may keep multiple linked guardians, but exactly one relationship is the active Attendance SMS Recipient at a time. Switching the recipient does not delete or replace other guardians.

Normal daily attendance messaging is therefore bounded to:
- one successful-arrival SMS;
- one successful-departure SMS.

An authorized early departure is the departure message for that day, not a third routine attendance message.

New guardian links do not silently become SMS recipients. School Registry exposes an explicit recipient switch and the chosen guardian must have an active phone number.

Current reassuring message style:
- arrival: `<Student> has arrived at school and checked in successfully. Time: ...`
- departure: `<Student> has checked out of school for the day. Time: ...`
- early departure: `<Student> has checked out of school early. Time: ...`

All messages retain the fixed ASCII footer `CASA - Do not reply.`.
