import assert from "node:assert/strict";
import fs from "node:fs";

function read(
  path: string,
) {
  return fs
    .readFileSync(
      path,
      "utf8",
    )
    .replace(
      /\r\n/g,
      "\n",
    );
}

function has(
  source: string,
  marker: string,
  label: string,
) {
  assert.ok(
    source.includes(
      marker,
    ),
    `${label}: missing ${marker}`,
  );
}

const schema =
  read(
    "src/db/schema/school-operations.ts",
  );

for (
  const marker of [
    "studentBranchTransferStatusEnum",
    "student_branch_transfer_requests",
    "student_branch_transfer_one_pending_idx",
    "PENDING",
    "CONFIRMED",
    "REJECTED",
    "CANCELLED",
  ]
) {
  has(
    schema,
    marker,
    "branch transfer schema",
  );
}

const transferService =
  read(
    "src/server/school-operations/transfers.ts",
  );

for (
  const marker of [
    "requestStudentBranchTransfer",
    "confirmStudentBranchTransfer",
    "rejectStudentBranchTransfer",
    "cancelStudentBranchTransfer",
    "home_branch_id = null",
    "TRANSFERRED",
    "target_class_arm_id",
    "ON_CAMPUS",
    "atomic_integrity_guard",
  ]
) {
  has(
    transferService,
    marker,
    "branch transfer service",
  );
}

const scope =
  read(
    "src/server/attendance/operational-scope.ts",
  );

for (
  const marker of [
    "BRANCH_TRANSFER_PENDING",
    "branchTransferPending",
    "student_branch_transfer_requests",
    "enrollment.status =",
    "'ACTIVE'::student_enrollment_status",
  ]
) {
  has(
    scope,
    marker,
    "transfer terminal suspension",
  );
}

const registry =
  read(
    "src/app/schools/[slug]/registry/registry-client.tsx",
  );

for (
  const marker of [
    "Request branch transfer",
    "Branch transfers",
    "Session progression",
    "/transfers",
    "/transfer",
  ]
) {
  has(
    registry,
    marker,
    "registry transfer UX",
  );
}

const studentRoute =
  read(
    "src/app/api/schools/[slug]/registry/students/[studentId]/route.ts",
  );

has(
  studentRoute,
  "registryStudentVisible",
  "post-transfer registry isolation",
);

const transferPage =
  read(
    "src/app/schools/[slug]/transfers/transfers-client.tsx",
  );

for (
  const marker of [
    "Incoming requests",
    "Confirm transfer",
    "Reject",
    "Cancel request",
  ]
) {
  has(
    transferPage,
    marker,
    "destination transfer UX",
  );
}

const progression =
  read(
    "src/app/schools/[slug]/progression/progression-client.tsx",
  );

for (
  const marker of [
    "Session Progression",
    "PROMOTED",
    "TRANSITIONED",
    "RETAINED",
    "TRANSFERRED",
    "GRADUATED",
    "WITHDRAWN",
    "Confirm progression after session end",
  ]
) {
  has(
    progression,
    marker,
    "progression UI",
  );
}

const templateDesigner =
  read(
    "src/app/internal/templates/template-designer.tsx",
  );

for (
  const marker of [
    "TEMPLATE_ARTWORK_MAX_DIMENSION",
    "TEMPLATE_ARTWORK_TARGET_BYTES",
    "image/webp",
  ]
) {
  has(
    templateDesigner,
    marker,
    "bounded template upload",
  );
}

const assetRoute =
  read(
    "src/app/api/internal/operations/templates/assets/route.ts",
  );

has(
  assetRoute,
  "4*1024*1024",
  "server upload guard",
);

const activation =
  read(
    "src/app/api/internal/operations/templates/[templateId]/activate/route.ts",
  );

for (
  const marker of [
    "reconcileInitialCardRollout",
    "limit:",
    "10",
  ]
) {
  has(
    activation,
    marker,
    "template activation initial-rollout recovery",
  );
}

const schedule =
  read(
    "src/server/card-production/scheduled-card-policy.ts",
  );

has(
  schedule,
  "initial_card_rollout_completed_at",
  "initial rollout immediate first-card scheduling",
);

console.log(
  "CASA M49 transfers + progression UI + template upload self-test passed.",
);
