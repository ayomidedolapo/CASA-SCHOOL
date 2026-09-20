import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) =>
  fs.readFileSync(path, "utf8");

const stepUp =
  read("src/server/auth/passkey-step-up.ts");
const service =
  read("src/server/card-production/bulk-activation.ts");
const route =
  read("src/app/api/schools/[slug]/registry/card-activation-batches/route.ts");
const component =
  read("src/app/schools/[slug]/registry/bulk-card-activation.tsx");
const registry =
  read("src/app/schools/[slug]/registry/registry-client.tsx");

assert.match(
  stepUp,
  /"CARD_BULK_ACTIVATE"/,
  "Passkey action must include campus bulk card activation",
);

for (const marker of [
  "consumePasskeyStepUpGrantWithId",
  'action: "CARD_BULK_ACTIVATE"',
  "'PRINTED'::student_card_production_status",
  "'ACTIVE'::student_biometric_profile_status",
  "school_branch_class_arms",
  "CARD_REPLACEMENT_PENDING",
  "not exists",
]) {
  assert.ok(
    service.includes(marker),
    `Bulk service missing ${marker}`,
  );
}

for (const marker of [
  "listVisibleBranches",
  "requireBranchAccess",
  "x-casa-passkey-step-up",
  "confirmPhysicalHandover",
]) {
  assert.ok(
    route.includes(marker),
    `Bulk route missing ${marker}`,
  );
}

for (const marker of [
  "Activate ready cards in one Passkey ceremony",
  'action:\n            "CARD_BULK_ACTIVATE"',
  "Branch Admins activate their own campus",
  "Activate ${readiness.eligibleCount} with Passkey",
  "new AbortController()",
  "controller.signal",
]) {
  assert.ok(
    component.includes(marker),
    `Bulk UI missing ${marker}`,
  );
}

assert.match(
  registry,
  /<BulkCardActivation[\s\S]*schoolSlug=\{school\.slug\}/,
  "Registry must expose campus bulk activation",
);

for (const marker of [
  "casa:card-activation-batch-complete",
  "cardActivationBatchVersion",
  'key={`${selectedStudent.id}:${cardActivationBatchVersion}`}',
]) {
  assert.ok(
    registry.includes(marker),
    `Registry batch-refresh wiring missing ${marker}`,
  );
}

assert.ok(
  !component.includes("void load()"),
  "Initial readiness effect must not call the state-setting load helper directly",
);

console.log(
  "CASA campus bulk card activation self-test passed.",
);
