import assert from "node:assert/strict";
import fs from "node:fs";

const renewal =
  fs.readFileSync(
    "src/server/card-production/renewal-production.ts",
    "utf8",
  );

const itemFunction =
  renewal.match(
    /export async function produceStudentCardRenewalItem[\s\S]*?export async function produceStudentCardRenewalBatch/,
  )?.[0] ??
  "";

const replaceAt =
  itemFunction.indexOf(
    "update student_identity_cards",
  );

const insertAt =
  itemFunction.indexOf(
    "insert into student_identity_cards",
  );

assert.ok(
  itemFunction.includes(
    "getRenewalTransactionSql",
  ),
);

assert.ok(
  itemFunction.includes(
    ".transaction([",
  ),
);

assert.ok(
  itemFunction.includes(
    "for update of",
  ),
);

assert.ok(
  replaceAt >= 0 &&
    insertAt >
      replaceAt,
  "Replacement update must execute before new ACTIVE-card insert inside the Neon transaction.",
);

assert.ok(
  itemFunction.includes(
    "student_identity_cards",
  ) &&
    itemFunction.includes(
      "'ACTIVE'::student_identity_card_status",
    ) &&
    itemFunction.includes(
      "'REPLACED'::student_identity_card_status",
    ),
);

assert.doesNotMatch(
  itemFunction,
  /with locked_item as \(/,
  "Single-statement writable CTE replacement is forbidden because PostgreSQL partial-unique enforcement can observe the old ACTIVE row while inserting the new ACTIVE row.",
);

console.log(
  "CASA School renewal ACTIVE-card transaction ordering self-test passed.",
);
