import assert from "node:assert/strict";
import fs from "node:fs";

const renewal =
  fs.readFileSync(
    "src/server/card-production/renewal-production.ts",
    "utf8",
  );

const batch =
  renewal.match(
    /export async function produceStudentCardRenewalBatch[\s\S]*$/,
  )?.[0] ??
  "";

assert.ok(
  batch.includes(
    "rowsOf<",
  ),
  "Batch producer must normalize execute() row containers.",
);

assert.match(
  batch,
  /rowsOf<\s*\{\s*id:\s*string;\s*\}>\s*\(\s*itemResult,\s*\)\.map/,
);

assert.doesNotMatch(
  batch,
  /Array\.isArray\(\s*itemResult\s*\)/,
  "Raw Array.isArray(itemResult) would drop Neon/Drizzle rows and return requested=0.",
);

console.log(
  "CASA School renewal batch execute-result-shape self-test passed.",
);
