import assert from "node:assert/strict";
import fs from "node:fs";

const read = (
  path: string,
) =>
  fs.readFileSync(
    path,
    "utf8",
  );

const provider =
  read(
    "src/server/messaging/simhostng-provider.ts",
  );
const worker =
  read(
    "src/server/messaging/outbox-worker.ts",
  );
const messaging =
  read(
    "src/app/api/schools/[slug]/messaging/route.ts",
  );
const dispatch =
  read(
    "src/app/api/schools/[slug]/messaging/dispatch/route.ts",
  );
const client =
  read(
    "src/app/schools/[slug]/messaging/messaging-client.tsx",
  );
const smsCron =
  read(
    "src/app/api/internal/jobs/sms-outbox/route.ts",
  );
const whatsappCron =
  read(
    "src/app/api/internal/jobs/whatsapp-outbox/route.ts",
  );

for (
  const marker of
    [
      "https://simhostng.com/api/sms",
      "CASA_SIMHOSTNG_API_KEY",
      "CASA_SIMHOSTNG_SERVER_ID",
      "CASA_SIMHOSTNG_SIM_SLOT",
      "number",
      "message",
      "CASA - Do not reply.",
      "has arrived at school and checked in successfully",
      "has checked out of school for the day",
      "has checked out of school early",
      "response",
      '"ok"',
    ]
) {
  assert.ok(
    provider.includes(
      marker,
    ),
    `SimHostNG provider marker missing: ${marker}`,
  );
}

assert.ok(
  worker.includes(
    "SIMHOSTNG_DEFAULT",
  ),
);
assert.ok(
  worker.includes(
    "for update of outbox",
  ) &&
    worker.includes(
      "skip locked",
    ),
);
assert.ok(
  worker.includes(
    "renderAttendanceSms",
  ),
);
assert.ok(
  worker.includes(
    "runSmsOutbox",
  ),
);
assert.ok(
  !worker.includes(
    "sendMetaWhatsappTemplate",
  ),
);

for (
  const marker of
    [
      "SAVE_SMS_SETTINGS",
      "DISABLE_SMS",
      "SIMHOSTNG_DEFAULT",
      "DELIVERY_CHANNEL_REPLACED",
      "SimHostNG SMS",
    ]
) {
  assert.ok(
    messaging.includes(
      marker,
    ),
    `Messaging API marker missing: ${marker}`,
  );
}

assert.ok(
  dispatch.includes(
    "runSmsOutbox",
  ),
);
assert.ok(
  smsCron.includes(
    "CRON_SECRET",
  ) &&
    smsCron.includes(
      "timingSafeEqual",
    ) &&
    smsCron.includes(
      "runSmsOutbox",
    ),
);

assert.ok(
  whatsappCron.includes(
    "WHATSAPP_SHELVED",
  ) &&
    whatsappCron.includes(
      "410",
    ),
);

for (
  const marker of
    [
      "Guardian SMS",
      "SimHostNG SMS",
      "School display name",
      "Optional note",
      "CASA - Do not reply.",
      "multiple billable SMS segments",
    ]
) {
  assert.ok(
    client.includes(
      marker,
    ),
    `SMS UI marker missing: ${marker}`,
  );
}

for (
  const forbidden of
    [
      "WhatsApp Business Account ID",
      "Phone Number ID",
      "Verify with Meta",
      "sendMetaWhatsappTemplate",
    ]
) {
  assert.ok(
    !client.includes(
      forbidden,
    ),
    `Shelved WhatsApp UI marker remains: ${forbidden}`,
  );
}

console.log(
  "CASA SimHostNG SMS source contract passed.",
);
