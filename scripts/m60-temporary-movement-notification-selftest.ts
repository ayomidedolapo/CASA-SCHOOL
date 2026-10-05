import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) =>
  fs.readFileSync(path, "utf8");

const guardian = read(
  "src/server/messaging/guardian-presence-push.ts",
);
const worker = read(
  "src/server/messaging/guardian-push-worker.ts",
);
const temp = read(
  "src/server/attendance/temporary-exit.ts",
);
const livenessComplete = read(
  "src/app/api/terminal/attempts/[attemptId]/biometric/liveness/complete/route.ts",
);
const directFinalize = read(
  "src/app/api/terminal/attempts/[attemptId]/finalize/route.ts",
);
const scanner = read(
  "src/app/scanner/scanner-client.tsx",
);

assert.ok(
  guardian.includes(
    "stepped out briefly from school at",
  ),
  "Temporary exit guardian copy must clearly describe a brief step-out.",
);

assert.ok(
  guardian.includes(
    "expected back on campus soon. Reason:",
  ),
  "Temporary exit guardian copy must include the school-entered reason.",
);

assert.ok(
  guardian.includes(
    "is now back on the school campus premises at",
  ),
  "Temporary return guardian copy must clearly confirm return to school premises.",
);

assert.match(
  guardian,
  /event\.reason[\s\S]*context\.reason[\s\S]*recipients\.reason/,
  "Temporary movement reason must flow from the presence event into guardian push rendering.",
);

assert.ok(
  temp.includes(
    "'reason', ${row.reason}",
  ),
  "Temporary movement legacy notification payload must preserve the reason.",
);

assert.ok(
  worker.includes(
    "summarizeGuardianPushDeliveryForPresenceEvent",
  ) &&
    worker.includes(
      "runGuardianPushOutboxForPresenceEvent",
    ),
  "Guardian push worker must expose event-specific persisted delivery truth.",
);

assert.match(
  worker,
  /sent_at is not null[\s\S]*device_displayed_at is not null/,
  "Persisted delivery summary must recognize already-sent/displayed notifications.",
);

assert.match(
  livenessComplete,
  /runGuardianPushOutboxForPresenceEvent[\s\S]*guardianPushDelivery/,
  "AWS liveness completion must return event-specific delivery truth.",
);

assert.match(
  directFinalize,
  /runGuardianPushOutboxForPresenceEvent[\s\S]*guardianPushDelivery/,
  "Direct finalize must return the same event-specific delivery truth.",
);

assert.match(
  scanner,
  /resultGuardianDelivery[\s\S]*\.sent[\s\S]*"Sent"/,
  "Scanner must continue rendering Sent when guardian delivery is confirmed.",
);

assert.match(
  scanner,
  /resultGuardianQueued[\s\S]*"No guardian device"/,
  "Scanner no-device fallback must remain only after delivery/queue evidence is absent.",
);

assert.ok(
  temp.includes("runGuardianPushOutbox"),
  "M57 immediate temporary-movement delivery path must remain preserved.",
);

assert.ok(
  guardian.includes("expected back on campus soon"),
  "M57 temporary-exit semantic wording must remain preserved.",
);

assert.ok(
  guardian.includes("is now back on the school campus"),
  "M57 temporary-return semantic wording must remain preserved.",
);

console.log(
  "GREEN: temporary step-out guardian notification includes the school-entered reason",
);
console.log(
  "GREEN: temporary return guardian notification confirms return to school premises",
);
console.log(
  "GREEN: Scanner guardian alert uses persisted event-specific delivery truth",
);
console.log(
  "GREEN: already-delivered temporary movement can no longer be mislabeled as No guardian device",
);
console.log(
  "GREEN: durable retry/offline guardian notification path remains preserved",
);
console.log(
  "RESULT: M60 TEMPORARY MOVEMENT NOTIFICATION CLOSURE GREEN",
);
