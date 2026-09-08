import assert from "node:assert/strict";
import fs from "node:fs";

const production =
  fs.readFileSync(
    "src/server/card-production/production.ts",
    "utf8",
  );

const renewal =
  fs.readFileSync(
    "src/server/card-production/renewal-production.ts",
    "utf8",
  );

const publicRoute =
  fs.readFileSync(
    "src/app/id-card/[publicKey]/route.ts",
    "utf8",
  );

const internalRoute =
  fs.readFileSync(
    "src/app/api/internal/card-production/renewal-batches/[batchId]/produce/route.ts",
    "utf8",
  );

for (
  const marker of [
    "produceStudentCardRenewalItem",
    "produceStudentCardRenewalBatch",
    "CASA_INTERNAL_RENEWAL",
    "internal_authority_reference",
    "student_card_renewal_batch_items",
    "production_job_id",
    "CARD_PRODUCTION_READY",
    "CASA_INTERNAL",
    "student_identity_card_events",
    "actor_kind",
    "RENEWAL_ITEM_ALREADY_PRODUCED",
    "RENEWAL_TARGET_ENROLLMENT_NOT_AUTHORITATIVE",
    "CARD_VISIBLE_DATA_INCOMPLETE",
  ]
) {
  assert.ok(
    renewal.includes(
      marker,
    ),
    `Missing secure renewal module marker: ${marker}`,
  );
}

assert.ok(
  renewal.includes(
    "production_authority",
  ),
  "Internal renewal job insert must name production_authority.",
);

assert.ok(
  renewal.includes(
    "'CASA_INTERNAL_RENEWAL'",
  ),
  "Internal renewal job insert must use CASA_INTERNAL_RENEWAL.",
);

assert.match(
  renewal,
  /issued_by_membership_id[\s\S]*?passkey_grant_id[\s\S]*?internal_authority_reference/,
);

assert.doesNotMatch(
  renewal,
  /consumePasskeyStepUpGrantWithId/,
  "Internal renewal must never consume or fabricate a school Passkey grant.",
);

assert.match(
  renewal,
  /student_identity_card_events[\s\S]*?actor_kind[\s\S]*?'CASA_INTERNAL'/,
  "Central renewal lifecycle events must use CASA_INTERNAL.",
);

assert.ok(
  production.includes(
    "CARD_VISIBLE_DATA_INCOMPLETE",
  ),
  "School-facing production must fail closed on incomplete visible data.",
);

assert.ok(
  production.includes(
    "export async function getStudentSnapshotSource",
  ),
  "Shared validated snapshot source must be explicitly exported.",
);

for (
  const marker of [
    "studentIdentityCards",
    "ACTIVE",
    "CARD_PUBLIC_ARTIFACT_INACTIVE",
  ]
) {
  assert.ok(
    publicRoute.includes(
      marker,
    ),
    `Missing public lifecycle marker: ${marker}`,
  );
}

const schemaImport =
  publicRoute.match(
    /import\s*\{([^}]*)\}\s*from\s*"@\/db\/schema";/,
  )?.[1] ??
  "";

const drizzleImport =
  publicRoute.match(
    /import\s*\{([^}]*)\}\s*from\s*"drizzle-orm";/,
  )?.[1] ??
  "";

assert.ok(
  /\bstudentIdentityCards\b/.test(
    schemaImport,
  ),
  "studentIdentityCards must be imported from @/db/schema.",
);

assert.ok(
  !/\bstudentIdentityCards\b/.test(
    drizzleImport,
  ),
  "studentIdentityCards must never be imported from drizzle-orm.",
);

assert.ok(
  /\band\b/.test(
    drizzleImport,
  ),
  "Public lifecycle route must import and from drizzle-orm.",
);

assert.ok(
  internalRoute.includes(
    "requireInternalCardProduction",
  ),
  "Renewal production route must remain CASA-internal.",
);

assert.ok(
  internalRoute.includes(
    "@/server/card-production/renewal-production",
  ),
  "Renewal route must use the dedicated renewal-production domain module.",
);


const batchFunction =
  renewal.match(
    /export async function produceStudentCardRenewalBatch[\s\S]*$/,
  )?.[0] ??
  "";

assert.ok(
  batchFunction.includes(
    "rowsOf<",
  ),
  "Renewal batch item selection must normalize Drizzle/Neon execute result rows.",
);

assert.doesNotMatch(
  batchFunction,
  /Array\.isArray\(\s*itemResult\s*\)/,
  "Renewal batch must not assume db.execute() returns a raw array.",
);

const itemFunction =
  renewal.match(
    /export async function produceStudentCardRenewalItem[\s\S]*?export async function produceStudentCardRenewalBatch/,
  )?.[0] ??
  "";

assert.ok(
  itemFunction.includes(
    "getRenewalTransactionSql",
  ),
  "Renewal item mutation must use the Neon HTTP transaction boundary.",
);

assert.ok(
  itemFunction.includes(
    ".transaction([",
  ),
  "Renewal item mutation must commit replacement + new ACTIVE card + audit + job + item link atomically.",
);

assert.ok(
  itemFunction.includes(
    "for update of",
  ),
  "Renewal transaction must lock the authoritative renewal item/enrollment/branch state.",
);

assert.ok(
  itemFunction.indexOf(
    "update student_identity_cards",
  ) <
    itemFunction.indexOf(
      "insert into student_identity_cards",
    ),
  "The existing ACTIVE card must be replaced before inserting the new ACTIVE card.",
);

assert.doesNotMatch(
  itemFunction,
  /with locked_item as \(/,
  "Renewal replacement must not use the single-statement data-modifying CTE shape that conflicts with the one-ACTIVE-card partial unique index.",
);

console.log(
  "CASA School secure renewal renderer + public lifecycle source self-test passed.",
);
