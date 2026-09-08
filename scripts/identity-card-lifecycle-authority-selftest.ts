import assert from "node:assert/strict";
import fs from "node:fs";

const migration =
  fs.readFileSync(
    "drizzle/20260830153500_identity-card-lifecycle-authority/migration.sql",
    "utf8",
  );

for (
  const marker of [
    'ADD COLUMN "actor_kind" varchar(32) DEFAULT \'SCHOOL_MEMBER\' NOT NULL',
    'ALTER COLUMN "actor_membership_id" DROP NOT NULL',
    '"actor_kind" = \'SCHOOL_MEMBER\'',
    '"actor_membership_id" IS NOT NULL',
    '"actor_kind" = \'CASA_INTERNAL\'',
    '"actor_membership_id" IS NULL',
    "student_identity_card_events_actor_authority_check",
    "student_identity_card_events_actor_created_idx",
  ]
) {
  assert.ok(
    migration.includes(
      marker,
    ),
    `Missing lifecycle-authority migration marker: ${marker}`,
  );
}

assert.doesNotMatch(
  migration,
  /\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+"?student_identity_card_events"?\b|\bINSERT\s+INTO\s+"?student_identity_card_events"?\b/i,
  "Migration19 must not rewrite/delete legacy identity-card lifecycle events.",
);

const schemaRoot =
  "src/db/schema";

const schemaFiles =
  fs.readdirSync(
    schemaRoot,
  )
    .filter(
      (name) =>
        name.endsWith(
          ".ts",
        ),
    )
    .map(
      (name) => ({
        name,
        text:
          fs.readFileSync(
            `${schemaRoot}/${name}`,
            "utf8",
          ),
      }),
    );

const lifecycle =
  schemaFiles.find(
    (file) =>
      file.text.includes(
        "studentIdentityCardEvents",
      ) &&
      file.text.includes(
        '"student_identity_card_events"',
      ),
  );

assert.ok(
  lifecycle,
  "Identity-card lifecycle Drizzle table was not found.",
);

for (
  const marker of [
    "actorKind",
    '"actor_kind"',
    '"SCHOOL_MEMBER"',
    '"CASA_INTERNAL"',
    "student_identity_card_events_actor_authority_check",
    "student_identity_card_events_actor_created_idx",
  ]
) {
  assert.ok(
    lifecycle.text.includes(
      marker,
    ),
    `Missing lifecycle-authority schema marker: ${marker}`,
  );
}

console.log(
  "CASA School identity-card lifecycle authority self-test passed.",
);
