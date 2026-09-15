# CASA School — WhatsApp Provider Delivery (Final Wave 2)

## Purpose

This closes the provider-delivery gap left intentionally open by the earlier School Messaging foundation. Attendance remains authoritative and must never fail because WhatsApp is unavailable.

## Existing database authority

No new migration is required. CASA already stores school WhatsApp sender identity and a durable guardian notification outbox with PENDING / PROCESSING / RETRY / SENT / FAILED / CANCELLED states, attempt counts, availability time, lease time, provider message ID and provider error details.

The three existing notification event types remain unchanged:

- `STUDENT_CHECKED_IN`
- `STUDENT_SIGNED_OUT`
- `STUDENT_EARLY_DEPARTURE`

Attendance finalization remains responsible only for atomically creating eligible outbox rows. It does not call Meta inline.

## Provider

Wave 2 uses the Meta WhatsApp Cloud API directly.

CASA stores only non-secret sender identity in `school_whatsapp_senders`. Provider tokens and webhook secrets remain deployment secrets. `provider_connection_ref` is an opaque key that resolves server-side through `CASA_WHATSAPP_META_CONNECTIONS_JSON`, or `META_DEFAULT` can resolve through `CASA_WHATSAPP_META_ACCESS_TOKEN`.

A school administrator cannot activate a sender merely by typing a phone number. CASA calls Meta using the configured connection reference and verifies the supplied phone-number ID. The returned display phone number and verified name become the sender identity shown by CASA.

## Required deployment configuration

- `CASA_WHATSAPP_PROVIDER_MODE=META_CLOUD`
- `CASA_WHATSAPP_GRAPH_VERSION` — explicit Graph version; source does not hard-code a version.
- `CASA_WHATSAPP_META_CONNECTIONS_JSON` — secret JSON map from opaque connection reference to Meta access token.
- `CASA_WHATSAPP_META_ACCESS_TOKEN` — optional single-token fallback used only by connection ref `META_DEFAULT`.
- `CASA_WHATSAPP_DEFAULT_COUNTRY_CODE` — e.g. `234` for local Nigerian numbers stored with a leading zero.
- `CASA_WHATSAPP_TEMPLATE_STUDENT_CHECKED_IN`
- `CASA_WHATSAPP_TEMPLATE_STUDENT_SIGNED_OUT`
- `CASA_WHATSAPP_TEMPLATE_STUDENT_EARLY_DEPARTURE`
- `CASA_WHATSAPP_TEMPLATE_LANGUAGE` — defaults to `en`.
- `CASA_WHATSAPP_META_WEBHOOK_VERIFY_TOKEN`
- `CASA_WHATSAPP_META_APP_SECRET`
- `CASA_WHATSAPP_MAX_ATTEMPTS` — defaults to 6.
- `CRON_SECRET` — protects the internal outbox job route.

## Template contract

Each approved Meta template used by CASA must expose exactly one BODY text variable. CASA supplies the already-snapshotted outbox `payload.message` as that variable. This keeps historical attendance message intent stable even if student data changes later.

## Delivery lifecycle

The worker atomically claims due PENDING / RETRY rows with `FOR UPDATE SKIP LOCKED`, changes them to PROCESSING, increments the attempt count and sets a lease timestamp. Stale PROCESSING rows without a provider message ID are recovered after ten minutes.

On Meta acceptance CASA records the returned provider message ID and marks the row SENT. Retryable network/429/5xx failures use bounded exponential backoff. Permanent errors or attempts beyond the configured limit become FAILED. One failed row does not abort the batch.

The design is deliberately idempotent at the CASA database boundary. As with any external provider call, an abrupt runtime loss after Meta accepts a request but before CASA records the provider ID can create an at-least-once edge case; operational monitoring should treat provider message IDs and webhooks as reconciliation evidence.

## Meta webhook

`/api/integrations/whatsapp/meta/webhook` supports provider verification and verifies POST payloads with `x-hub-signature-256` using the deployment app secret. Meta delivery failures move known provider message IDs to FAILED. sent/delivered/read confirmations remain represented as SENT because the existing schema deliberately has one successful delivery state.

## Scheduling

`/api/internal/jobs/whatsapp-outbox` is protected by `CRON_SECRET` and is ready for Vercel Cron or another scheduler. The deployment/configuration closure must choose a schedule compatible with the project's Vercel plan. Manual OWNER/ADMIN dispatch remains available from the school Messaging page regardless of cron frequency.

## School operations UI

`/schools/[slug]/messaging` provides:

- provider readiness without exposing secret values;
- Meta-verified sender activation;
- sender suspension/revocation;
- durable outbox status counts;
- masked guardian destinations;
- provider/error visibility;
- manual queue processing;
- controlled retry of FAILED rows whose sender is still ACTIVE.

No provider access token, webhook app secret or cron secret is ever accepted by the browser UI.

## External prerequisites, not another CASA feature wave

A real live-message proof still requires a Meta Business account, an onboarded WhatsApp phone number, an access credential with the required permissions, approved message templates matching the CASA one-variable contract, and deployment-secret binding. Those are provider configuration/go-live tasks rather than additional product implementation.
