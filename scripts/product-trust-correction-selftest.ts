import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relative: string) {
  return fs.readFileSync(
    path.join(root, relative),
    "utf8",
  );
}

function requireText(
  source: string,
  needle: string,
  label: string,
) {
  if (!source.includes(needle)) {
    throw new Error(
      `${label}: missing ${needle}`,
    );
  }
}

const bulk =
  read(
    "src/server/card-production/bulk-activation.ts",
  );
requireText(
  bulk,
  "getBranchActiveCardActivationAudit",
  "card activation provenance",
);
requireText(
  bulk,
  "'ACTIVATED'::student_identity_card_event_type",
  "activation-event provenance",
);
requireText(
  bulk,
  "consumePasskeyStepUpGrantWithId",
  "bulk activation passkey gate",
);

const batchRoute =
  read(
    "src/app/api/schools/[slug]/registry/card-activation-batches/route.ts",
  );
requireText(
  batchRoute,
  "activeCards:",
  "card activation audit response",
);

const batchUi =
  read(
    "src/app/schools/[slug]/registry/bulk-card-activation.tsx",
  );
requireText(
  batchUi,
  "Activation history",
  "activation history UI",
);
requireText(
  batchUi,
  "No activation event recorded",
  "legacy activation provenance fallback",
);

const guardians =
  read(
    "src/app/api/schools/[slug]/registry/guardians/route.ts",
  );
requireText(
  guardians,
  "notificationsEnabled",
  "guardian notification state",
);
requireText(
  guardians,
  "guardian_push_devices",
  "guardian device truth source",
);

const registry =
  read(
    "src/app/schools/[slug]/registry/registry-client.tsx",
  );
requireText(
  registry,
  "Portal linked",
  "guardian portal state",
);
requireText(
  registry,
  "Notifications enabled",
  "guardian notification state UI",
);
requireText(
  registry,
  "No portal account",
  "guardian no-portal wording",
);

const attendance =
  read(
    "src/app/schools/[slug]/attendance/attendance-client.tsx",
  );
requireText(
  attendance,
  "const policyDays",
  "per-day attendance payload",
);
requireText(
  attendance,
  "dayTimes[",
  "per-weekday schedule lookup",
);
requireText(
  attendance,
  "Editing one weekday changes only that weekday",
  "per-day attendance UX explanation",
);

const terminalList =
  read(
    "src/app/api/schools/[slug]/attendance/terminals/route.ts",
  );
requireText(
  terminalList,
  "visibleBranchIds",
  "terminal list campus scope",
);
requireText(
  terminalList,
  "mapping.branch_id =",
  "terminal SQL campus filter column",
);
requireText(
  terminalList,
  "any(",
  "terminal SQL campus filter membership",
);

const terminalLifecycle =
  read(
    "src/app/api/schools/[slug]/attendance/terminals/[terminalId]/route.ts",
  );
requireText(
  terminalLifecycle,
  "TERMINAL_CAMPUS_SCOPE_DENIED",
  "terminal lifecycle campus scope",
);
requireText(
  terminalLifecycle,
  "TERMINAL_CAMPUS_IMMUTABLE",
  "terminal campus immutability",
);
requireText(
  terminalLifecycle,
  "TERMINAL_CAMPUS_REQUIRED",
  "legacy terminal assignment gate",
);

const technician =
  read(
    "src/app/schools/[slug]/technician/technician-client.tsx",
  );
requireText(
  technician,
  "Campus locked",
  "terminal campus lock UI",
);

console.log(
  "CASA product trust correction self-test passed.",
);
