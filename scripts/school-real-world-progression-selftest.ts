import assert from "node:assert/strict";
import fs from "node:fs";

const read =
  (filePath: string) =>
    fs.readFileSync(
      filePath,
      "utf8",
    );

const compact =
  (value: string) =>
    value.replace(
      /\s+/g,
      " ",
    );

function section(
  source: string,
  startMarker: string,
  endMarker: string,
) {
  const start =
    source.indexOf(
      startMarker,
    );

  assert.ok(
    start >= 0,
    `Missing section start: ${startMarker}`,
  );

  const end =
    source.indexOf(
      endMarker,
      start +
        startMarker.length,
    );

  assert.ok(
    end > start,
    `Missing section end: ${endMarker}`,
  );

  return source.slice(
    start,
    end,
  );
}

function sectionToEnd(
  source: string,
  startMarker: string,
) {
  const start =
    source.indexOf(
      startMarker,
    );

  assert.ok(
    start >= 0,
    `Missing section start: ${startMarker}`,
  );

  return source.slice(
    start,
  );
}

const required = [
  "src/server/school-operations/progression.ts",
  "src/app/api/schools/[slug]/progression/batches/route.ts",
  "src/app/api/schools/[slug]/progression/batches/[batchId]/route.ts",
  "src/app/api/schools/[slug]/progression/batches/[batchId]/decisions/route.ts",
  "src/app/api/schools/[slug]/progression/batches/[batchId]/confirm/route.ts",
];

for (const file of required) {
  assert.ok(
    fs.existsSync(
      file,
    ),
    `Missing progression backend file: ${file}`,
  );
}

const progression =
  read(
    "src/server/school-operations/progression.ts",
  );
const decisionsRoute =
  read(
    "src/app/api/schools/[slug]/progression/batches/[batchId]/decisions/route.ts",
  );
const operations =
  read(
    "src/server/school-operations/operations.ts",
  );

const updateDecision =
  section(
    progression,
    "export async function updateProgressionDecision",
    "export async function cancelProgressionBatch",
  );

const confirmBatch =
  sectionToEnd(
    progression,
    "export async function confirmProgressionBatch",
  );

const compactUpdate =
  compact(
    updateDecision,
  );
const compactConfirm =
  compact(
    confirmBatch,
  );

for (const marker of [
  "PENDING",
  "PROMOTED",
  "TRANSITIONED",
  "RETAINED",
  "TRANSFERRED",
  "GRADUATED",
  "WITHDRAWN",
  "SOURCE_SESSION_NOT_ENDED",
  "PROGRESSION_REVIEW_INCOMPLETE",
  "CROSS_BRANCH_TRANSFER_REQUIRES_HQ",
  "TRANSFER_CONFIRMATION_REQUIRES_HQ",
  "INVALID_SECTION_TRANSITION_TARGET",
  "INVALID_PROMOTION_TARGET",
  "atomic_integrity_guard",
  "renewalItems:",
]) {
  assert.ok(
    progression.includes(
      marker,
    ),
    `Missing progression marker: ${marker}`,
  );
}

assert.ok(
  decisionsRoute.includes(
    '"TRANSITIONED"',
  ),
  "Progression decision API must accept TRANSITIONED.",
);

assert.ok(
  compactUpdate.includes(
    "select branch_map.branch_id",
  ) &&
  compactUpdate.includes(
    "target.branch_id !== current.source_branch_id",
  ),
  "Progression target class must resolve a branch and compare it with the source branch.",
);

assert.ok(
  compactUpdate.includes(
    'input.decision === "TRANSFERRED"',
  ) &&
  compactUpdate.includes(
    "CROSS_BRANCH_TRANSFER_REQUIRES_HQ",
  ) &&
  compactUpdate.includes(
    "CROSS_BRANCH_REQUIRES_TRANSFER",
  ),
  "Cross-branch progression must remain explicit and organization-authorized.",
);

assert.ok(
  compactUpdate.includes(
    'input.decision === "TRANSITIONED"',
  ) &&
  compactUpdate.includes(
    "target.section_sort_order <="
  ) &&
  compactUpdate.includes(
    "current.source_section_sort_order",
  ) &&
  compactUpdate.includes(
    "INVALID_SECTION_TRANSITION_TARGET",
  ),
  "TRANSITIONED must move to a later configured school section.",
);

assert.ok(
  compactUpdate.includes(
    'input.decision === "PROMOTED"',
  ) &&
  compactUpdate.includes(
    "target.section_sort_order === current.source_section_sort_order",
  ) &&
  compactUpdate.includes(
    "target.class_level_sort_order > current.source_class_level_sort_order",
  ),
  "PROMOTED must move forward within the same section.",
);

assert.ok(
  compactUpdate.includes(
    'input.decision === "RETAINED"',
  ) &&
  compactUpdate.includes(
    "target.class_level_id !== current.source_class_level_id",
  ) &&
  compactUpdate.includes(
    "INVALID_RETENTION_TARGET",
  ),
  "RETAINED must remain at the same class level.",
);

assert.ok(
  compactConfirm.includes(
    "source_enrollment.status = 'ACTIVE'::student_enrollment_status",
  ),
  "Confirmation must close only the expected ACTIVE source enrollment.",
);

assert.ok(
  compactConfirm.includes(
    "d.decision <> 'PENDING'::student_progression_decision",
  ) &&
  compactConfirm.includes(
    "review.pending_count"
  ),
  "Confirmation must reject unresolved PENDING progression decisions.",
);

const transitionedSqlCount =
  (
    progression.match(
      /'TRANSITIONED'::student_progression_decision/g,
    ) ??
    []
  ).length;

assert.ok(
  transitionedSqlCount >=
    3,
  "TRANSITIONED must participate in continuing-student confirmation SQL.",
);

assert.ok(
  compactConfirm.includes(
    "'GRADUATED'::student_progression_decision",
  ) &&
  compactConfirm.includes(
    "'WITHDRAWN'::student_progression_decision",
  ) &&
  compactConfirm.includes(
    "'GRADUATED'::student_status",
  ) &&
  compactConfirm.includes(
    "'WITHDRAWN'::student_status",
  ),
  "GRADUATED/WITHDRAWN must remain terminal school-exit decisions.",
);

assert.ok(
  compactConfirm.includes(
    "renewalItems: 0",
  ),
  "Permanent-card progression must report zero routine renewal items.",
);

for (const staleMarker of [
  "student_card_renewal_batches",
  "student_card_renewal_batch_items",
  "SESSION_CHANGE",
  "CLASS_AND_SESSION_CHANGE",
]) {
  assert.ok(
    !progression.includes(
      staleMarker,
    ),
    `Permanent-card progression must not reintroduce legacy renewal state: ${staleMarker}`,
  );
}

assert.ok(
  operations.includes(
    "school_branch_admin_assignments",
  ),
  "Branch-access foundation is missing.",
);

assert.doesNotMatch(
  progression,
  /SCHOOL_TECHNICIAN/,
  "Progression service must not grant technician authority implicitly.",
);

console.log(
  "CASA School permanent-card progression/transition backend self-test passed.",
);
