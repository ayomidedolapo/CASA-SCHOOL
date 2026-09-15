import fs from "node:fs";
import path from "node:path";

import {
  isTransientWhatsappHttpStatus,
  normalizeWhatsappRecipient,
  whatsappRetryDelaySeconds,
} from "../src/server/messaging/whatsapp-provider";

function fail(message: string): never {
  throw new Error(`CASA WhatsApp Wave 2 self-test failed: ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

const root = process.cwd();
const required = [
  "src/server/messaging/whatsapp-provider.ts",
  "src/server/messaging/outbox-worker.ts",
  "src/app/api/internal/jobs/whatsapp-outbox/route.ts",
  "src/app/api/integrations/whatsapp/meta/webhook/route.ts",
  "src/app/api/schools/[slug]/messaging/route.ts",
  "src/app/api/schools/[slug]/messaging/dispatch/route.ts",
  "src/app/schools/[slug]/messaging/page.tsx",
  "src/app/schools/[slug]/messaging/messaging-client.tsx",
  "docs/architecture/WHATSAPP_PROVIDER_DELIVERY.md",
];

for (const relative of required) {
  assert(fs.existsSync(path.join(root, relative)), `required path missing: ${relative}`);
}

assert(normalizeWhatsappRecipient("0802 123 4567", "234") === "2348021234567", "Nigeria local phone normalization drifted.");
assert(normalizeWhatsappRecipient("+234 802 123 4567", "234") === "2348021234567", "International phone normalization drifted.");
assert(isTransientWhatsappHttpStatus(429), "HTTP 429 must remain retryable.");
assert(isTransientWhatsappHttpStatus(503), "HTTP 503 must remain retryable.");
assert(!isTransientWhatsappHttpStatus(400), "HTTP 400 must not be classified as transient.");
assert(whatsappRetryDelaySeconds(1) === 60, "initial retry delay changed.");
assert(whatsappRetryDelaySeconds(10) === 3600, "retry delay cap changed.");

const client = fs.readFileSync(
  path.join(root, "src/app/schools/[slug]/messaging/messaging-client.tsx"),
  "utf8",
);
for (const forbidden of ["CASA_WHATSAPP_META_ACCESS_TOKEN", "CASA_WHATSAPP_META_APP_SECRET", "CRON_SECRET"]) {
  assert(!client.includes(forbidden), `browser client references server secret ${forbidden}.`);
}

const worker = fs.readFileSync(path.join(root, "src/server/messaging/outbox-worker.ts"), "utf8");
assert(worker.includes("for update of outbox skip locked"), "worker lost its concurrent claim guard.");
assert(worker.includes("STALE_PROCESSING_RECOVERED"), "worker lost stale lease recovery.");
assert(worker.includes("provider_message_id"), "provider message ID persistence is missing.");

const webhook = fs.readFileSync(path.join(root, "src/app/api/integrations/whatsapp/meta/webhook/route.ts"), "utf8");
assert(webhook.includes("x-hub-signature-256"), "Meta webhook signature verification is missing.");

const cron = fs.readFileSync(path.join(root, "src/app/api/internal/jobs/whatsapp-outbox/route.ts"), "utf8");
assert(cron.includes("CRON_SECRET"), "cron authorization guard is missing.");

const attendance = fs.readFileSync(path.join(root, "src/app/schools/[slug]/attendance/attendance-client.tsx"), "utf8");
assert(attendance.includes("/messaging`"), "Attendance manager navigation does not expose Messaging.");

console.log("CASA WhatsApp Wave 2 source contract passed.");
