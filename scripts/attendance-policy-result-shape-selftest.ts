import assert from "node:assert/strict";

import {
  firstAttendanceDbRow,
} from "../src/server/attendance/policy-management";

const arrayRow = {
  id: "array-row",
};

const queryResultRow = {
  id: "query-result-row",
};

assert.deepEqual(
  firstAttendanceDbRow([
    arrayRow,
  ]),
  arrayRow,
  "array result first row",
);

assert.deepEqual(
  firstAttendanceDbRow({
    rows: [
      queryResultRow,
    ],
  }),
  queryResultRow,
  "Neon QueryResult.rows first row",
);

assert.equal(
  firstAttendanceDbRow({
    rows: [],
  }),
  null,
  "empty QueryResult.rows",
);

assert.equal(
  firstAttendanceDbRow(
    null,
  ),
  null,
  "null result",
);

assert.equal(
  firstAttendanceDbRow({
    rows:
      "not-an-array",
  }),
  null,
  "invalid rows property",
);

console.log(
  "CASA School attendance policy Neon result-shape self-test passed.",
);
