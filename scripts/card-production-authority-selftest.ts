import assert from "node:assert/strict";
import fs from "node:fs";

import {
  casaInternalRenewalCardProductionAuthority,
  schoolMembershipCardProductionAuthority,
  toCardProductionAuthorityColumns,
} from "../src/server/card-production/authority";

const school =
  toCardProductionAuthorityColumns(
    schoolMembershipCardProductionAuthority({
      issuedByMembershipId:
        "membership-1",
      passkeyGrantId:
        "grant-1",
    }),
  );

assert.deepEqual(
  school,
  {
    productionAuthority:
      "SCHOOL_MEMBERSHIP",
    issuedByMembershipId:
      "membership-1",
    passkeyGrantId:
      "grant-1",
    internalAuthorityReference:
      null,
  },
);

const internal =
  toCardProductionAuthorityColumns(
    casaInternalRenewalCardProductionAuthority(
      "renewal-item-1",
    ),
  );

assert.deepEqual(
  internal,
  {
    productionAuthority:
      "CASA_INTERNAL_RENEWAL",
    issuedByMembershipId:
      null,
    passkeyGrantId:
      null,
    internalAuthorityReference:
      "renewal-item-1",
  },
);

const schema =
  fs.readFileSync(
    "src/db/schema/card-production.ts",
    "utf8",
  );

for (
  const marker of [
    "productionAuthority",
    "production_authority",
    "SCHOOL_MEMBERSHIP",
    "CASA_INTERNAL_RENEWAL",
    "internalAuthorityReference",
    "internal_authority_reference",
    "student_card_production_jobs_authority_check",
    "student_card_production_jobs_authority_status_idx",
  ]
) {
  assert.ok(
    schema.includes(
      marker,
    ),
    `Missing card-production authority schema marker: ${marker}`,
  );
}

const migration =
  fs.readFileSync(
    "drizzle/20260830143000_card-production-authority/migration.sql",
    "utf8",
  );

for (
  const marker of [
    'ALTER COLUMN "issued_by_membership_id" DROP NOT NULL',
    'ALTER COLUMN "passkey_grant_id" DROP NOT NULL',
    '"production_authority" = \'SCHOOL_MEMBERSHIP\'',
    '"production_authority" = \'CASA_INTERNAL_RENEWAL\'',
    '"internal_authority_reference" IS NOT NULL',
    "student_card_production_jobs_authority_check",
    "student_card_production_jobs_authority_status_idx",
  ]
) {
  assert.ok(
    migration.includes(
      marker,
    ),
    `Missing migration18 authority marker: ${marker}`,
  );
}

assert.doesNotMatch(
  migration,
  /DROP TABLE|TRUNCATE|DELETE FROM|UPDATE\s+"student_card_production_jobs"/i,
  "Migration18 must be additive/constraint-oriented and must not rewrite or delete production jobs.",
);

console.log(
  "CASA School card-production authority foundation self-test passed.",
);
