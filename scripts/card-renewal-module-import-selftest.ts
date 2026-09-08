import assert from "node:assert/strict";

import {
  produceStudentCardRenewalBatch,
  produceStudentCardRenewalItem,
} from "../src/server/card-production/renewal-production";

assert.equal(
  typeof produceStudentCardRenewalItem,
  "function",
);

assert.equal(
  typeof produceStudentCardRenewalBatch,
  "function",
);

console.log(
  "CASA School renewal-production module import self-test passed.",
);
