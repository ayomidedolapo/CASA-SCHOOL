import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}
function requireText(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`M53 selftest failed: ${label}`);
  }
  console.log(`GREEN: ${label}`);
}
function forbidText(source: string, needle: string, label: string) {
  if (source.includes(needle)) {
    throw new Error(`M53 selftest failed: ${label}`);
  }
  console.log(`GREEN: ${label}`);
}

const fcm = read("src/server/messaging/firebase-fcm.ts");
const worker = read("src/server/messaging/guardian-push-worker.ts");
const registration = read("src/app/api/guardian-notifications/device-registration/route.ts");
const serviceWorker = read("src/app/firebase-messaging-sw.js/route.ts");

requireText(fcm, "collapseTopic?: string | null;", "FCM supports per-outbox collapse topic");
requireText(fcm, "Topic:", "WebPush retry uses Topic collapse semantics");
requireText(fcm, 'TTL:\n                    "86400"', "FCM keeps 24-hour provider TTL");
requireText(fcm, 'Urgency:\n                    "high"', "FCM push remains high urgency");
forbidText(fcm, "notification: {\n                title:", "FCM common automatic-display payload removed");
forbidText(fcm, "notification: {\n                  ...(input.iconUrl", "FCM webpush automatic-display payload removed");

requireText(worker, "'PENDING',\n          'RETRY',\n          'FAILED',\n          'SENT'", "worker reclaims failed and unacknowledged sent rows");
requireText(worker, "outbox.device_displayed_at is null", "worker stops retry after browser display proof");
requireText(worker, "now() - interval '7 days'", "retry freshness window is seven days");
requireText(worker, "displayRetryDelayMinutes(", "accepted but unacknowledged push schedules redelivery");
requireText(worker, "retryDelayMinutes(", "transient provider failures use durable backoff");
forbidText(worker, "row.attempt_count >= 5", "transient pushes no longer fail permanently after five attempts");
requireText(worker, "status = 'RETRY'", "transient provider failures remain retryable");
requireText(worker, "collapseTopic:", "worker supplies stable collapse topic");
requireText(worker, "terminalFcmRegistrationFailure(", "terminal invalid-device detection preserved");
requireText(worker, "status = 'DISABLED'", "terminal invalid devices are still disabled");

requireText(registration, "displayed_outbox as (", "catch-up closes pending outbox display state");
requireText(registration, "device_displayed_at = coalesce(", "catch-up writes display proof to outbox");

requireText(serviceWorker, "CASA_M53_GUARDIAN_DISPLAY_RETRY_AUTHORITY", "M53 live marker present");
requireText(serviceWorker, ".showNotification(", "CASA service worker remains display authority");
requireText(serviceWorker, ".then(() => casaAcknowledgeDisplayed(data))", "display acknowledged only after showNotification resolves");

console.log("RESULT: M53 guardian push reliability selftest GREEN");
