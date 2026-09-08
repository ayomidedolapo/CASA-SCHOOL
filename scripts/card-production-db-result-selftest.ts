import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  firstDbRow,
} from "../src/server/card-production/db-result";

assert.deepEqual(
  firstDbRow<{ id: string }>([
    { id: "array-row" },
  ]),
  { id: "array-row" },
  "plain array results must expose their first row",
);

assert.deepEqual(
  firstDbRow<{ id: string }>({
    rows: [
      { id: "query-result-row" },
    ],
  }),
  { id: "query-result-row" },
  "QueryResult-style { rows: [...] } results must expose their first row",
);

assert.equal(
  firstDbRow([]),
  null,
  "empty array must return null",
);

assert.equal(
  firstDbRow({ rows: [] }),
  null,
  "empty QueryResult rows must return null",
);

assert.equal(
  firstDbRow(null),
  null,
  "null must return null",
);

const route = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/api/internal/card-production/templates/[templateId]/activate/route.ts",
  ),
  "utf8",
);

assert.match(
  route,
  /firstDbRow<{/,
  "activation route must normalize db.execute() through firstDbRow",
);

assert.doesNotMatch(
  route,
  /Array\.isArray\(\s*result\s*\)[\s\S]{0,100}\?\s*result\[0\]/,
  "activation route must not regress to array-only result parsing",
);

console.log(
  "CASA School card-production db.execute() result-shape self-test passed.",
);
