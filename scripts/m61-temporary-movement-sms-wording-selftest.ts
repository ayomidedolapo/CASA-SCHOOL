import assert from "node:assert/strict";
import fs from "node:fs";

import {
  renderAttendanceSms,
} from "../src/server/messaging/simhostng-provider";

const read = (path: string) =>
  fs.readFileSync(path, "utf8");

const provider = read(
  "src/server/messaging/simhostng-provider.ts",
);
const temp = read(
  "src/server/attendance/temporary-exit.ts",
);
const push = read(
  "src/server/messaging/guardian-presence-push.ts",
);

const base = {
  schoolName:
    "CASA Test School",
  note:
    null,
  timeZone:
    "Africa/Lagos",
};

const stepOut =
  renderAttendanceSms({
    ...base,
    eventType:
      "STUDENT_TEMPORARILY_OUT",
    payload: {
      studentName:
        "Ada Student",
      occurredAt:
        "2026-10-05T09:00:00.000Z",
      reason:
        "Clinic visit",
    },
  });

assert.ok(
  stepOut.includes(
    "Ada Student stepped out briefly from school at",
  ),
  "Step-out SMS must explicitly say stepped out briefly.",
);
assert.ok(
  stepOut.includes(
    "Reason: Clinic visit.",
  ),
  "Step-out SMS must include the school-entered reason.",
);
assert.ok(
  stepOut.includes(
    "Expected back on campus soon.",
  ),
  "Step-out SMS must state that the student is expected back.",
);
assert.doesNotMatch(
  stepOut,
  /checked out of school for the day/i,
  "Step-out SMS must never fall through to final checkout wording.",
);

const returned =
  renderAttendanceSms({
    ...base,
    eventType:
      "STUDENT_RETURNED_TO_CAMPUS",
    payload: {
      studentName:
        "Ada Student",
      occurredAt:
        "2026-10-05T09:30:00.000Z",
      reason:
        "Clinic visit",
    },
  });

assert.ok(
  returned.includes(
    "Ada Student is back on school premises at",
  ),
  "Return SMS must explicitly say the student is back on school premises.",
);
assert.doesNotMatch(
  returned,
  /checked out/i,
  "Return SMS must never contain checkout wording.",
);

const finalCheckout =
  renderAttendanceSms({
    ...base,
    eventType:
      "STUDENT_SIGNED_OUT",
    payload: {
      studentName:
        "Ada Student",
      signedOutAt:
        "2026-10-05T14:00:00.000Z",
    },
  });

assert.ok(
  finalCheckout.includes(
    "has checked out of school for the day",
  ),
  "Final checkout wording must remain unchanged.",
);

assert.match(
  provider,
  /STUDENT_TEMPORARILY_OUT[\s\S]*STUDENT_RETURNED_TO_CAMPUS/,
  "SMS event contract must explicitly support both temporary movement events.",
);

assert.match(
  temp,
  /'studentName', recipients\.student_name[\s\S]*'reason', \$\{row\.reason\}[\s\S]*'occurredAt', \$\{row\.occurred_at\}/,
  "Temporary movement SMS payload must carry studentName, reason and occurredAt.",
);

assert.ok(
  push.includes(
    "expected back on campus soon. Reason:",
  ) &&
    push.includes(
      "is now back on the school campus premises at",
    ),
  "M60 browser push wording must remain preserved.",
);

console.log(
  "GREEN: temporary step-out SMS uses brief-exit wording with reason",
);
console.log(
  "GREEN: temporary return SMS says student is back on school premises",
);
console.log(
  "GREEN: temporary movement cannot fall through to final checkout SMS",
);
console.log(
  "GREEN: normal final checkout wording remains unchanged",
);
console.log(
  "GREEN: M60 browser push wording remains preserved",
);
console.log(
  "RESULT: M61 TEMPORARY MOVEMENT SMS WORDING CLOSURE GREEN",
);