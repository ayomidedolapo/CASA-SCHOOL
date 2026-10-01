import assert from "node:assert/strict";
import fs from "node:fs";

function read(path: string) {
  return fs
    .readFileSync(path, "utf8")
    .replace(/\r\n/g, "\n");
}

function has(
  source: string,
  marker: string,
  label: string,
) {
  assert.ok(
    source.includes(marker),
    `${label}: missing ${marker}`,
  );
}

const schools =
  read("src/db/schema/schools.ts");

for (const marker of [
  "schools_initial_card_rollout_manual_completion_check",
  "initialCardRolloutCompletedAt",
  "initialCardRolloutCompletedByInternalMembershipId",
  "is null",
  "is not null",
]) {
  has(
    schools,
    marker,
    "manual rollout completion DB invariant",
  );
}

const rollout =
  read(
    "src/server/card-production/initial-rollout.ts",
  );

for (const marker of [
  "completed_by_present",
  "row.completed_at &&",
  "row.completed_by_present",
  "initial_card_rollout_completed_by_internal_membership_id",
  "completeInitialCardRollout",
]) {
  has(
    rollout,
    marker,
    "explicit rollout completion service",
  );
}

const route =
  read(
    "src/app/api/internal/platform/schools/[schoolId]/card-rollout/complete/route.ts",
  );

for (const marker of [
  "requireCasaSuperAdmin",
  "z.literal",
  "INITIAL_CARD_ROLLOUT_COMPLETED",
]) {
  has(
    route,
    marker,
    "Super Admin completion authority",
  );
}

const client =
  read(
    "src/app/internal/schools/[schoolId]/school-detail-client.tsx",
  );

for (const marker of [
  "Complete initial card rollout",
  "Complete initial card rollout?",
  "CASA Super Admin",
  "setRolloutConfirmOpen",
]) {
  has(
    client,
    marker,
    "explicit completion UX",
  );
}

const schedule =
  read(
    "src/server/card-production/scheduled-card-policy.ts",
  );

has(
  schedule,
  "initial_card_rollout_completed_at",
  "post-rollout batching boundary",
);

console.log(
  "CASA M48 explicit initial-rollout confirmation self-test passed.",
);
