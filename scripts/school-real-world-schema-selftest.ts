import assert from "node:assert/strict";
import fs from "node:fs";

const schema =
  fs.readFileSync(
    "src/db/schema/school-operations.ts",
    "utf8",
  );

for (
  const marker of [
    "schoolBranches",
    "schoolBranchAdminAssignments",
    "schoolBranchSections",
    "schoolBranchClassArms",
    "schoolBranchTerminals",
    "schoolCalendarEvents",
    "studentAttendanceExcuses",
    "studentProgressionBatches",
    "studentProgressionDecisions",
    "studentCardRenewalBatches",
    "studentCardRenewalBatchItems",
    "PENDING",
    "PROMOTED",
    "RETAINED",
    "TRANSFERRED",
    "GRADUATED",
    "WITHDRAWN",
    "CLASS_CHANGE",
    "SESSION_CHANGE",
    "CLASS_AND_SESSION_CHANGE",
  ]
) {
  assert.ok(
    schema.includes(marker),
    `Missing real-world school foundation marker: ${marker}`,
  );
}

const index =
  fs.readFileSync(
    "src/db/schema/index.ts",
    "utf8",
  );

assert.ok(
  index.includes(
    'export * from "./school-operations";',
  ),
  "Schema index does not export school-operations.",
);

console.log(
  "CASA School real-world schema foundation self-test passed.",
);
