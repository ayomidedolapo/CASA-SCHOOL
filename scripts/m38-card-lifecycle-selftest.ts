import assert from "node:assert/strict";
import fs from "node:fs";

import {
  fitCardTextNormalized,
} from "../src/lib/card-text-fit";

const read =
  (path: string) =>
    fs.readFileSync(
      path,
      "utf8",
    );

const migration =
  read(
    "drizzle/20260918134000_m38_card_lifecycle_template_scope/migration.sql",
  );
const schema =
  read(
    "src/db/schema/card-production.ts",
  );
const renderer =
  read(
    "src/server/card-production/render.ts",
  );
const lifecycle =
  read(
    "src/server/card-production/m38-lifecycle.ts",
  );
const production =
  read(
    "src/server/card-production/production.ts",
  );
const enrollmentRoute =
  read(
    "src/app/api/schools/[slug]/registry/students/[studentId]/enrollments/route.ts",
  );
const productionRoute =
  read(
    "src/app/api/schools/[slug]/registry/students/[studentId]/cards/production/route.ts",
  );
const studentsRoute =
  read(
    "src/app/api/schools/[slug]/registry/students/route.ts",
  );
const registryClient =
  read(
    "src/app/schools/[slug]/registry/registry-client.tsx",
  );
const studentCards =
  read(
    "src/app/schools/[slug]/registry/student-cards.tsx",
  );
const templateCreate =
  read(
    "src/app/api/internal/operations/templates/route.ts",
  );
const templateUpdate =
  read(
    "src/app/api/internal/operations/templates/[templateId]/route.ts",
  );
const templateActivate =
  read(
    "src/app/api/internal/operations/templates/[templateId]/activate/route.ts",
  );
const designer =
  read(
    "src/app/internal/templates/template-designer.tsx",
  );
const notificationRoute =
  read(
    "src/app/api/schools/[slug]/registry/students/[studentId]/guardians/[linkId]/push-invite/route.ts",
  );
const registryOps =
  read(
    "src/app/schools/[slug]/registry/m34a-registry-operations.tsx",
  );
const bulkActivation =
  read(
    "src/server/card-production/bulk-activation.ts",
  );
const packageJson =
  read(
    "package.json",
  );

for (
  const marker of [
    "SCHOOL_ENROLLMENT_AUTO_ISSUE",
    '"passkey_grant_id" IS NULL',
    '"internal_authority_reference" IS NOT NULL',
    "student_card_production_jobs_authority_check",
  ]
) {
  assert.ok(
    migration.includes(
      marker,
    ),
    `Migration 38 missing ${marker}`,
  );
}

assert.doesNotMatch(
  migration,
  /\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i,
  "Migration 38 must not delete production data.",
);

for (
  const marker of [
    '"SCHOOL_ENROLLMENT_AUTO_ISSUE"',
    "student_card_production_jobs_internal_authority_reference_unique",
    "student_card_production_jobs_authority_check",
  ]
) {
  assert.ok(
    schema.includes(
      marker,
    ),
    `Schema missing ${marker}`,
  );
}
assert.doesNotMatch(
  schema,
  /undefined is not null|undefined = 'SCHOOL_MEMBERSHIP'/,
  "Card production schema must not contain the stale undefined authority SQL.",
);

for (
  const marker of [
    "CARD_TEXT_FONT_FAMILY",
    '"Noto Sans"',
    "CARD_TEXT_FONT_FILE",
    "fontfile:",
    "probeCardTextRuntime",
    "fitCardTextNormalized",
    "artifactRevision",
  ]
) {
  assert.ok(
    renderer.includes(
      marker,
    ),
    `Renderer missing ${marker}`,
  );
}
assert.doesNotMatch(
  renderer,
  /VECTOR_GLYPHS|vectorTextLine|<rect /,
  "M37 pixel-box glyph renderer must be gone.",
);
assert.doesNotMatch(
  renderer,
  /function textSvg|sharp-svg-generic-sans/,
  "Card text must not regress to host-dependent SVG font rendering.",
);

const fit =
  fitCardTextNormalized({
    value:
      "Christopher Oluwatobiloba Adeyemi",
    fontSize: 0.07,
    minFontSize: 0.026,
    maxWidth: 0.82,
    maxLines: 2,
  });
assert.ok(
  fit.lines.length <= 2,
  "Long-name preview must stay within two configured lines.",
);
assert.ok(
  fit.fontSize >= 0.026 &&
    fit.fontSize <= 0.07,
  "Long-name auto-fit size escaped configured bounds.",
);

for (
  const marker of [
    "ensureFirstStudentCardForEnrollment",
    "ensureFirstStudentCardForActiveEnrollment",
    "refreshUnprintedCardsForTemplate",
    "SCHOOL_ENROLLMENT_AUTO_ISSUE",
    "READY_FOR_ACTIVATION",
    "EXPORTED",
    "requeuedFromExported",
    "artifactRevision",
    "for update",
  ]
) {
  assert.ok(
    lifecycle.includes(
      marker,
    ),
    `M38 lifecycle missing ${marker}`,
  );
}
assert.match(
  lifecycle,
  /select id[\s\S]*from student_identity_cards[\s\S]*school_id[\s\S]*student_id[\s\S]*order by issued_at desc[\s\S]*limit 1/,
  "Automatic first-card issuance must detect any previous student card, not only current cards.",
);
assert.match(
  lifecycle,
  /status =\s*'READY'::student_card_production_status[\s\S]*exported_at =\s*null/,
  "Template refresh must requeue stale exports before printing.",
);
assert.match(
  lifecycle,
  /cardSerial:\s*job\.serial_number/,
  "Template refresh must preserve the physical card serial number.",
);

assert.match(
  production,
  /previousCards/,
  "Passkey production must detect prior card history.",
);
assert.match(
  production,
  /previousCard[\s\S]*\?[\s\S]*"CARD_REISSUE"[\s\S]*:[\s\S]*"CARD_ISSUE"/,
  "Historical cards must use reissue Passkey authority.",
);

assert.ok(
  enrollmentRoute.includes(
    "ensureFirstStudentCardForEnrollment",
  ),
  "Enrollment must automatically provision the first digital card.",
);
assert.ok(
  enrollmentRoute.includes(
    "cardProvisioning",
  ),
  "Enrollment must report first-card provisioning state.",
);

assert.ok(
  productionRoute.includes(
    "ensureFirstStudentCardForActiveEnrollment",
  ),
  "Missing-first-card recovery path is absent.",
);
assert.match(
  productionRoute,
  /if \(!stepUpToken\)/,
  "Missing first card must not require a per-student Passkey.",
);

for (
  const marker of [
    "operationalBranches.length !==",
    "registrationCampus",
    "operationalBranch.id",
  ]
) {
  assert.ok(
    studentsRoute.includes(
      marker,
    ),
    `Campus-scope route missing ${marker}`,
  );
}
assert.doesNotMatch(
  studentsRoute,
  /parsed\.data\.branchId/,
  "Student registration must not trust a client-selected campus.",
);
assert.doesNotMatch(
  registryClient,
  /name=["']branchId["']/,
  "School Registry must not expose a campus selector for student registration.",
);
assert.ok(
  registryClient.includes(
    "signed-in administrator&apos;s operating scope",
  ),
  "Registration campus explanation is missing.",
);
assert.ok(
  registryClient.includes(
    "created the first digital card automatically",
  ),
  "Enrollment first-card feedback is missing.",
);

for (
  const marker of [
    "Create missing first card",
    "Reissue card with Passkey",
    "CARD_REISSUE",
    "reissueRequired",
    "casa:student-card-changed",
  ]
) {
  assert.ok(
    studentCards.includes(
      marker,
    ),
    `Student card UI missing ${marker}`,
  );
}
assert.doesNotMatch(
  studentCards,
  /Issue with Passkey/,
  "First-card UI must not require individual Passkey issuance.",
);

for (
  const source of [
    templateCreate,
    templateUpdate,
    templateActivate,
  ]
) {
  assert.ok(
    source.includes(
      "refreshUnprintedCardsForTemplate",
    ),
    "Every template activation path must refresh unprinted digital cards.",
  );
}

for (
  const marker of [
    "SAMPLE_PROFILES",
    "Short name",
    "Typical name",
    "Long name",
    "John Deo",
    "Live fit preview",
    "fitCardTextNormalized",
    "Arial, Helvetica, sans-serif",
    "Text box width",
    "Minimum auto-fit size",
    "Printed cards remain frozen production history",
    "containerType: \"inline-size\"",
    "cqw",
  ]
) {
  assert.ok(
    designer.includes(
      marker,
    ),
    `Template designer missing ${marker}`,
  );
}

for (
  const marker of [
    "has_prior_invite",
    "SECURITY_SETTINGS",
    "PASSKEY_STEP_UP_REQUIRED",
    "interval '48 hours'",
    "claimed_at is null",
  ]
) {
  assert.ok(
    notificationRoute.includes(
      marker,
    ),
    `Guardian notification recovery missing ${marker}`,
  );
}
for (
  const marker of [
    "SECURITY_SETTINGS",
    "Reset setup link with Passkey",
    "Existing enabled devices remain connected",
  ]
) {
  assert.ok(
    registryOps.includes(
      marker,
    ),
    `Guardian notification UI missing ${marker}`,
  );
}

for (
  const marker of [
    "CARD_BULK_ACTIVATE",
    "PRINTED",
  ]
) {
  assert.ok(
    bulkActivation.includes(
      marker,
    ),
    `Campus one-Passkey handover contract missing ${marker}`,
  );
}

assert.ok(
  packageJson.includes(
    '"m38:selftest"',
  ),
  "package.json must expose m38:selftest.",
);

console.log(
  "CASA M38 card lifecycle, live-template, campus-scope and guardian-recovery self-test passed.",
);
