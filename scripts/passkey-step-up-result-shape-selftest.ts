import assert from "node:assert/strict";

import {
  hasPasskeyStepUpReturnedRow,
} from "../src/server/auth/passkey-step-up";

assert.equal(
  hasPasskeyStepUpReturnedRow([
    {
      id: "array-row",
    },
  ]),
  true,
  "array result with a returned row must be accepted",
);

assert.equal(
  hasPasskeyStepUpReturnedRow({
    rows: [
      {
        id: "query-result-row",
      },
    ],
  }),
  true,
  "QueryResult-style { rows: [...] } must be accepted",
);

assert.equal(
  hasPasskeyStepUpReturnedRow([]),
  false,
  "empty array result must be rejected",
);

assert.equal(
  hasPasskeyStepUpReturnedRow({
    rows: [],
  }),
  false,
  "empty QueryResult rows must be rejected",
);

assert.equal(
  hasPasskeyStepUpReturnedRow(null),
  false,
  "null result must be rejected",
);

console.log(
  "CASA School Passkey step-up DB result-shape self-test passed.",
);
