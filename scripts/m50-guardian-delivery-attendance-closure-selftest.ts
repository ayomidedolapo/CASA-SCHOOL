import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) =>
  fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const migration = read("drizzle/20261003040800_m50_guardian_delivery_attendance_closure/migration.sql");
const worker = read("src/server/messaging/guardian-push-worker.ts");
const presence = read("src/server/messaging/guardian-presence-push.ts");
const early = read("src/server/attendance/early-departure.ts");
const attendance = read("src/app/schools/[slug]/attendance/attendance-client.tsx");
const sw = read("src/app/firebase-messaging-sw.js/route.ts");

for (const marker of [
  "'DISABLED'",
  "casa_propagate_guardian_push_device_bindings",
  "guardian_push_device_binding_propagation_trigger",
  "casa_bind_guardian_push_devices_on_notification_opt_in",
  "guardian_push_notification_opt_in_binding_trigger",
  "guardian_push_devices_guardian_active_idx",
  "target.receives_notifications = true",
]) {
  assert.ok(migration.includes(marker), `M50 migration missing ${marker}`);
}

assert.ok(worker.includes("recoverStaleGuardianPushClaims"));
assert.ok(worker.includes("sendFcmWithImmediateRetry"));
assert.ok(worker.includes("attempt <= 3"));
assert.ok(presence.includes("CASA_GUARDIAN_PUSH_QUEUE_FAILED"));

const start = early.indexOf("export async function cancelEarlyDeparture");
const end = early.indexOf("export async function preauthorizeEarlyDepartures");
const block = early.slice(start, end);
assert.ok(block.includes("cancelledResult"));
assert.ok(block.includes("'NOT_RUN'::attendance_departure_result"));
assert.ok(block.includes("CASA_EARLY_DEPARTURE_LIVENESS_CLEANUP_FAILED"));
assert.ok(/try\s*\{[\s\S]*biometric_liveness_sessions[\s\S]*\}\s*catch/.test(block));
assert.ok(!block.includes("with grant_check as"));

assert.ok(attendance.includes("This Saturday session will count toward official attendance and punctuality"));
assert.ok(attendance.includes("Use Prepare presence-only instead"));
assert.ok(sw.includes("CASA_M50_GUARDIAN_DELIVERY_ATTENDANCE_CLOSURE"));

console.log("CASA M50 guardian delivery + attendance closure self-test passed.");
