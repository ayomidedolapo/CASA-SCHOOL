import assert from "node:assert/strict";

import {
  asArrayRow,
} from "../src/server/card-production/production";

assert.deepEqual(
  asArrayRow<{ id: string }>([
    { id: "array-row" },
  ]),
  { id: "array-row" },
  "plain array result must return its first row",
);

assert.deepEqual(
  asArrayRow<{ id: string }>({
    rows: [
      { id: "query-result-row" },
    ],
  }),
  { id: "query-result-row" },
  "QueryResult-style { rows: [...] } must return its first row",
);

assert.equal(
  asArrayRow([]),
  null,
  "empty array must return null",
);

assert.equal(
  asArrayRow({ rows: [] }),
  null,
  "empty QueryResult rows must return null",
);

assert.equal(
  asArrayRow(null),
  null,
  "null must return null",
);

console.log(
  "CASA School card-production DB result-shape self-test passed.",
);
