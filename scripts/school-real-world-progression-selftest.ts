import assert from "node:assert/strict";
import fs from "node:fs";

const required = [
  "src/server/school-operations/progression.ts",
  "src/server/card-production/renewal-manifest.ts",
  "src/app/api/schools/[slug]/progression/batches/route.ts",
  "src/app/api/schools/[slug]/progression/batches/[batchId]/route.ts",
  "src/app/api/schools/[slug]/progression/batches/[batchId]/decisions/route.ts",
  "src/app/api/schools/[slug]/progression/batches/[batchId]/confirm/route.ts",
  "src/app/api/internal/card-production/renewal-batches/route.ts",
  "src/app/api/internal/card-production/renewal-batches/[batchId]/route.ts",
  "src/app/api/internal/card-production/renewal-batches/[batchId]/manifest/route.ts",
];

for (const file of required) {
  assert.ok(
    fs.existsSync(file),
    `Missing progression/renewal backend file: ${file}`,
  );
}

const progression =
  fs.readFileSync(
    "src/server/school-operations/progression.ts",
    "utf8",
  );

for (const marker of [
  "PENDING",
  "PROMOTED",
  "RETAINED",
  "TRANSFERRED",
  "GRADUATED",
  "WITHDRAWN",
  "SOURCE_SESSION_NOT_ENDED",
  "PROGRESSION_REVIEW_INCOMPLETE",
  "CROSS_BRANCH_TRANSFER_REQUIRES_HQ",
  "TRANSFER_CONFIRMATION_REQUIRES_HQ",
  "student_card_renewal_batches",
  "student_card_renewal_batch_items",
  "SESSION_CHANGE",
  "CLASS_AND_SESSION_CHANGE",
  "atomic_integrity_guard",
  "1 / (",
]) {
  assert.ok(
    progression.includes(marker),
    `Missing progression marker: ${marker}`,
  );
}

assert.match(
  progression,
  /decision <>[\s\S]*'PENDING'::student_progression_decision/,
);

assert.match(
  progression,
  /source_enrollment\.status =[\s\S]*'ACTIVE'::student_enrollment_status/,
);

assert.match(
  progression,
  /target_branch\.branch_id/,
);

const manifest =
  fs.readFileSync(
    "src/server/card-production/renewal-manifest.ts",
    "utf8",
  );

for (const marker of [
  "Summary",
  "Organization",
  "Academic Session",
  "branch_name",
  "section_name",
  "PENDING_PRODUCTION",
  "Production Job ID",
]) {
  assert.ok(
    manifest.includes(marker),
    `Missing renewal workbook marker: ${marker}`,
  );
}

const operations =
  fs.readFileSync(
    "src/server/school-operations/operations.ts",
    "utf8",
  );

assert.ok(
  operations.includes(
    "school_branch_admin_assignments",
  ),
  "V1B1 branch-access foundation is missing.",
);

assert.doesNotMatch(
  progression,
  /SCHOOL_TECHNICIAN/,
  "Progression service must not grant technician authority implicitly.",
);

console.log(
  "CASA School progression/retention/renewal backend self-test passed.",
);
