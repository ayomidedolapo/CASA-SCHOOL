import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function expectContains(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`M51 selftest failed: ${label} missing ${JSON.stringify(needle)}`);
  }
}

function expectAbsent(source: string, needle: string, label: string) {
  if (source.includes(needle)) {
    throw new Error(`M51 selftest failed: ${label} unexpectedly contains ${JSON.stringify(needle)}`);
  }
}

const migration = read(
  "drizzle/20261003110000_m51_guardian_registration_catchup_presence_only/migration.sql",
);
const keeper = read("src/app/guardian-device-registration-keeper.tsx");
const layout = read("src/app/layout.tsx");
const setupClient = read(
  "src/app/guardian-notifications/[token]/guardian-notification-client.tsx",
);
const tokenRoute = read("src/app/api/guardian-notifications/[token]/route.ts");
const deviceRoute = read(
  "src/app/api/guardian-notifications/device-registration/route.ts",
);
const ackRoute = read(
  "src/app/api/guardian-notifications/delivery-ack/route.ts",
);
const sw = read("src/app/firebase-messaging-sw.js/route.ts");
const foreground = read("src/app/casa-foreground-notifications.tsx");
const fcm = read("src/server/messaging/firebase-fcm.ts");
const worker = read("src/server/messaging/guardian-push-worker.ts");
const supervised = read("src/server/attendance/supervised-arrival.ts");
const replacement = read("src/server/attendance/card-replacement.ts");
const attendanceClient = read(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
);

// Schema / lifecycle persistence.
expectContains(migration, "guardian_push_browser_registrations", "migration");
expectContains(migration, "browser_registration_id", "migration");
expectContains(migration, "delivery_receipt_token", "migration");
expectContains(migration, "device_displayed_at", "migration");
expectContains(migration, "guardian_push_delivery_receipts", "migration");
expectContains(
  migration,
  "casa_propagate_guardian_push_device_bindings",
  "migration multi-child propagation",
);
expectContains(
  migration,
  "casa_bind_guardian_push_devices_on_notification_opt_in",
  "migration opt-in propagation",
);

// Page-side Firebase registration lifecycle. Firebase v12.19 register() returns void;
// FID is intentionally taken from onRegistered().
expectContains(keeper, "onRegistered", "registration keeper");
expectContains(keeper, "onUnregistered", "registration keeper");
expectContains(keeper, "await register(", "registration keeper");
expectContains(keeper, 'action:\n                "SYNC"', "registration keeper sync");
expectContains(keeper, 'action:\n                "UNREGISTER"', "registration keeper unregister");
expectContains(keeper, 'action:\n              "ACK_CATCH_UP"', "registration keeper catch-up ack");
expectContains(keeper, "casa-presence-${record.presenceEventId}", "catch-up de-dup tag");
expectAbsent(
  keeper,
  'pathname.startsWith(\n          "/guardian-notifications/"',
  "keeper guardian-link availability",
);
expectContains(layout, "<GuardianDeviceRegistrationKeeper />", "layout keeper mount");
expectContains(
  setupClient,
  "casa:guardian-push-registration-credentials:v1",
  "setup durable credential",
);
expectContains(setupClient, "browserCredential", "setup browser credential post");
expectContains(
  setupClient,
  "Firebase acceptance alone is not treated as proof",
  "truthful setup copy",
);
expectContains(
  tokenRoute,
  "testPushAcceptedByFirebase",
  "truthful provider acceptance response",
);
expectAbsent(tokenRoute, "testPushDelivered", "truthful provider acceptance response");

// Device sync / catch-up must use authoritative presence and notification relationships.
expectContains(deviceRoute, "student_presence_events", "catch-up authoritative events");
expectContains(deviceRoute, "relationship.receives_notifications = true", "catch-up opt-in");
expectContains(deviceRoute, "now() - interval '7 days'", "bounded catch-up window");
expectContains(deviceRoute, "order by event.occurred_at asc", "catch-up ordering");
expectContains(deviceRoute, "limit 100", "bounded catch-up count");
expectContains(deviceRoute, "status = 'STALE'", "unregistered lifecycle");
expectContains(deviceRoute, "status = 'DISABLED'", "stale device disable");

// FCM status truth / terminal registration retirement.
expectContains(fcm, "errorStatus", "FCM error status parsing");
expectContains(worker, "terminalFcmRegistrationFailure", "terminal FCM detection");
expectContains(worker, "delivery_receipt_token", "outbox receipt token");
expectContains(worker, "casaReceiptToken", "push receipt data");
expectContains(worker, "status = 'STALE'", "terminal browser registration retirement");
expectContains(worker, "status = 'DISABLED'", "terminal device retirement");
expectContains(worker, "then 'FAILED'", "terminal current outbox failure");
expectContains(worker, "else 'CANCELLED'", "terminal pending outbox cancellation");

// Browser-display acknowledgements. These prove browser display-call completion, not human reading.
expectContains(ackRoute, "device_displayed_at", "delivery acknowledgement");
expectContains(ackRoute, "guardian_push_delivery_receipts", "delivery receipt");
expectContains(sw, "CASA_M51_GUARDIAN_REGISTRATION_CATCHUP_PRESENCE_ONLY", "M51 worker marker");
expectContains(sw, "casaAcknowledgeDisplayed", "background display ack");
expectContains(sw, "casa-presence-", "background de-dup tag");
expectAbsent(sw, "clients.openWindow", "guardian click no-navigation invariant");
expectAbsent(sw, "casaClickUrl", "guardian click no-navigation invariant");
expectAbsent(sw, "onRegistered(", "service worker lifecycle isolation");
expectAbsent(sw, "onUnregistered(", "service worker lifecycle isolation");
expectContains(foreground, "acknowledgeDisplayedPush", "foreground display ack");
expectContains(foreground, "casa-presence-${presenceEventId}", "foreground de-dup tag");
expectAbsent(
  foreground,
  'pathname.startsWith(\n          "/guardian-notifications/"',
  "guardian-link foreground availability",
);

// Saturday / PRESENCE_ONLY supervised identity path.
expectContains(supervised, "attendance_branch_sessions branch_session", "first-card branch session");
expectContains(supervised, "'PRESENCE_ONLY'", "first-card presence-only support");
expectContains(supervised, "SUPERVISED_LATE_INSTRUCTIONAL_ONLY", "late remains instructional");
expectContains(supervised, "runGuardianPushOutbox", "first-card guardian push");
expectContains(replacement, "attendance_branch_sessions branch_session", "replacement branch session");
expectContains(replacement, "'PRESENCE_ONLY'", "replacement presence-only support");
expectContains(
  replacement,
  'if (!replacementPaid && session.mode === "INSTRUCTIONAL")',
  "presence-only must not consume instructional grace",
);
expectContains(attendanceClient, 'data?.session?.mode === "PRESENCE_ONLY"', "presence-only UI");
expectContains(attendanceClient, '"First-card presence"', "first-card presence action");
expectContains(attendanceClient, '"Lost-card presence"', "lost-card presence action");
expectContains(attendanceClient, "no instructional grace day was consumed", "presence-only grace copy");
expectContains(
  attendanceClient,
  'data.session.mode === "INSTRUCTIONAL" && (',
  "Record late remains instructional-only",
);

console.log("CASA M51 source selftest: GREEN");
console.log("- durable page-side FID lifecycle: PRESENT");
console.log("- terminal FID retirement: PRESENT");
console.log("- provider-accepted vs browser-display distinction: PRESENT");
console.log("- ordered bounded catch-up with de-dup receipts: PRESENT");
console.log("- guardian click remains close-only/no-navigation: PRESENT");
console.log("- OPEN PRESENCE_ONLY first-card/lost-card supervised presence: PRESENT");
console.log("- PRESENCE_ONLY lost-card instructional grace consumption: ABSENT");
