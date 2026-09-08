import assert from "node:assert/strict";
import fs from "node:fs";

const source =
  fs.readFileSync(
    "src/server/attendance/card-replacement-completion.ts",
    "utf8",
  );
const route =
  fs.readFileSync(
    "src/app/api/schools/[slug]/registry/students/[studentId]/card-replacement/complete/route.ts",
    "utf8",
  );

assert.match(
  source,
  /CARD_REPLACEMENT_PENDING/,
);
assert.match(
  source,
  /'PRINTED'::student_card_production_status/,
);
assert.match(
  source,
  /'ACTIVE'::student_identity_card_status/,
);
assert.match(
  source,
  /replacement_requested_at/,
);
assert.match(
  source,
  /completed_by_membership_id/,
);
assert.match(
  source,
  /replacement_card_id/,
);
assert.match(
  route,
  /requireRegistryOperator/,
);

assert.doesNotMatch(
  source,
  /insert\s+into\s+student_identity_cards/i,
  "Completion must never manufacture a replacement card.",
);
assert.doesNotMatch(
  source,
  /insert\s+into\s+student_card_production_jobs/i,
  "Completion must never manufacture a production job.",
);
assert.doesNotMatch(
  source,
  /update\s+student_card_production_jobs/i,
  "Completion must never mark a production job printed.",
);

console.log(
  "CASA School Wave 2 card replacement completion self-test passed.",
);
