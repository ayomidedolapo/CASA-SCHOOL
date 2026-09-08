import assert from "node:assert/strict";
import fs from "node:fs";

const moduleSource =
  fs.readFileSync(
    "src/server/school-operations/structure-correction.ts",
    "utf8",
  );
const internalRoute =
  fs.readFileSync(
    "src/app/api/internal/onboarding/schools/[schoolId]/structure/route.ts",
    "utf8",
  );
const schoolRoute =
  fs.readFileSync(
    "src/app/api/schools/[slug]/branches/[branchId]/correction/route.ts",
    "utf8",
  );
const migration =
  fs.readFileSync(
    "drizzle/20260902201500_wave2_structure_audit/migration.sql",
    "utf8",
  );

assert.match(
  internalRoute,
  /ORGANIZATION_RESTRUCTURE/,
);
assert.match(
  schoolRoute,
  /requireOrganizationAdmin/,
);
assert.match(
  moduleSource,
  /branch_count/,
);
assert.match(
  moduleSource,
  /STANDALONE_STRUCTURE_REQUIRED/,
);
assert.match(
  moduleSource,
  /school_branch_class_arms/,
);
assert.match(
  moduleSource,
  /school_branch_sections/,
);
assert.match(
  moduleSource,
  /school_structure_change_events/,
);
assert.match(
  moduleSource,
  /STANDALONE_TO_MULTI_BRANCH_RESTRUCTURE/,
);

assert.doesNotMatch(
  moduleSource,
  /update\s+students\b/i,
  "Structure correction must not rewrite students.",
);
assert.doesNotMatch(
  moduleSource,
  /update\s+student_enrollments\b/i,
  "Structure correction must not rewrite student enrollment identity/history.",
);
assert.doesNotMatch(
  moduleSource,
  /delete\s+from\s+students\b/i,
);
assert.doesNotMatch(
  moduleSource,
  /delete\s+from\s+student_enrollments\b/i,
);

assert.match(
  migration,
  /SCHOOL_MEMBERSHIP/,
);
assert.match(
  migration,
  /CASA_INTERNAL/,
);
assert.match(
  migration,
  /before_snapshot/,
);
assert.match(
  migration,
  /after_snapshot/,
);

console.log(
  "CASA School Wave 2 structure self-test passed.",
);
