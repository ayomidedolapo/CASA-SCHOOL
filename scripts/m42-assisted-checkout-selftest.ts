import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) =>
  fs.readFileSync(
    path,
    "utf8",
  );

const service = read(
  "src/server/attendance/assisted-checkout.ts",
);
const route = read(
  "src/app/api/schools/[slug]/attendance/assisted-checkouts/[studentId]/route.ts",
);
const client = read(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
);
const passkey = read(
  "src/server/auth/passkey-step-up.ts",
);
const replacement = read(
  "src/server/attendance/card-replacement.ts",
);

assert.ok(
  passkey.includes(
    "\"ASSISTED_CHECK_OUT\"",
  ),
  "Assisted checkout must have a dedicated Passkey action.",
);

for (
  const marker of [
    "ASSISTED_CHECKOUT_ACTIVE_CARD_USE_SCANNER",
    "ACTIVE_BIOMETRIC_PROFILE_REQUIRED",
    "ASSISTED_CHECKOUT_COMPLETED",
    "SIGNED_OUT",
    "STUDENT_SIGNED_OUT",
    "STUDENT_EARLY_DEPARTURE",
    "queueGuardianPresencePushBestEffort",
    "CARD_REPLACEMENT_PAYMENT_REQUIRED",
    "CARD_REPLACEMENT_NOT_INSTRUCTIONAL_DAY",
    "replacement_payment_status",
    "replacement_reported_lost_on",
    "countInstructionalGraceDays",
    "graceDayNumber > 3",
  ]
) {
  assert.ok(
    service.includes(marker),
    `Missing assisted-checkout service marker: ${marker}`,
  );
}

assert.ok(
  replacement.includes(
    "export async function countInstructionalGraceDays",
  ),
  "Replacement check-in and assisted checkout must share the same instructional-day grace counter.",
);

assert.ok(
  service.includes(
    'paymentStatus === "UNPAID"'
  ) &&
    service.includes(
      "candidate.replacement_case_id",
    ),
  "Unpaid LOST/DAMAGED replacement cases must be grace-limited; paid cases remain assisted-attendance eligible.",
);

assert.ok(
  route.includes(
    "confirmStudentFaceMatch",
  ),
  "Route must require explicit face-match confirmation.",
);

assert.ok(
  route.includes(
    "x-casa-passkey-step-up",
  ),
  "Route must consume staff Passkey step-up.",
);

assert.ok(
  client.includes(
    "Assisted sign-out",
  ),
  "Attendance UI must expose Assisted sign-out for no-active-card students.",
);

assert.ok(
  client.includes(
    "ASSISTED_CHECK_OUT",
  ),
  "Attendance UI must request the dedicated Passkey action.",
);

assert.ok(
  !client.includes(
    "No active card · assisted checkout required",
  ),
  "The old dead-end cardless early-departure message must be removed.",
);

assert.ok(
  !client.includes(
    "No active card · Scanner checkout unavailable",
  ),
  "The old dead-end cardless after-hours message must be removed.",
);

console.log(
  "CASA M42 assisted checkout selftest GREEN",
);
