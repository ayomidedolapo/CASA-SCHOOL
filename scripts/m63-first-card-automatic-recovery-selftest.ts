import assert from "node:assert/strict";
import fs from "node:fs";

function read(path: string) {
  return fs
    .readFileSync(
      path,
      "utf8",
    )
    .replace(
      /\r\n/g,
      "\n",
    );
}

function has(
  source: string,
  marker: string,
  label: string,
) {
  assert.ok(
    source.includes(
      marker,
    ),
    `${label}: missing ${marker}`,
  );
}

function forbids(
  source: string,
  marker: string,
  label: string,
) {
  assert.ok(
    !source.includes(
      marker,
    ),
    `${label}: forbidden ${marker}`,
  );
}

const ui =
  read(
    "src/app/schools/[slug]/registry/student-cards.tsx",
  );

forbids(
  ui,
  "Create missing first card",
  "manual first-card button removed",
);

forbids(
  ui,
  "Missing first digital card created from the active enrollment",
  "manual first-card success copy removed",
);

has(
  ui,
  "{reissueRequired ? (",
  "top card action is reissue-only",
);

has(
  ui,
  "Reissue card with Passkey",
  "controlled card-history reissue remains available",
);

has(
  ui,
  "First-card creation is automatic.",
  "UI protects accidental manual first-card invocation",
);

const schoolProductionRoute =
  read(
    "src/app/api/schools/[slug]/registry/students/[studentId]/cards/production/route.ts",
  );

forbids(
  schoolProductionRoute,
  "ensureFirstStudentCardForActiveEnrollment",
  "manual first-card helper removed from school production route",
);

forbids(
  schoolProductionRoute,
  "automaticFirstCard",
  "school production route no longer returns manual first-card success",
);

forbids(
  schoolProductionRoute,
  "if (!stepUpToken) {",
  "school production route no longer owns a no-Passkey first-card fallback",
);

has(
  schoolProductionRoute,
  "stepUpToken,",
  "school production route delegates lifecycle/token classification to central service",
);

const production =
  read(
    "src/server/card-production/production.ts",
  );

has(
  production,
  "if (!previousCard) {",
  "central production detects zero card history",
);

has(
  production,
  '"FIRST_CARD_AUTOMATIC_ONLY"',
  "central production blocks manual first-card issuance",
);

has(
  production,
  'const action:\n    CardProductionAction =\n      "CARD_REISSUE";',
  "manual production is reissue-only after lifecycle guards",
);

const rollout =
  read(
    "src/server/card-production/initial-rollout.ts",
  );

forbids(
  rollout,
  "!before ||\n    before.completedAt",
  "completed rollout no longer disables missing-first-card recovery",
);

has(
  rollout,
  "const rolloutCompleted =",
  "reconciliation records whether rollout is complete",
);

has(
  rollout,
  "rolloutCompleted\n      ? 0\n      : rowsOf",
  "completed rollout does not force-release scheduled first-card jobs",
);

has(
  rollout,
  "reconcileMissingFirstCardsForSchool",
  "school-scoped automatic first-card recovery helper exists",
);

has(
  rollout,
  "student.status =",
  "background recovery checks active student state",
);

has(
  rollout,
  "'ACTIVE'::student_enrollment_status",
  "background recovery checks active enrollment state",
);

has(
  rollout,
  "from student_identity_cards card",
  "background recovery excludes students with card history",
);

const enrollment =
  read(
    "src/app/api/schools/[slug]/registry/students/[studentId]/enrollments/route.ts",
  );

has(
  enrollment,
  "ensureFirstStudentCardForEnrollment",
  "enrollment still automatically provisions first card",
);

const createTemplate =
  read(
    "src/app/api/internal/operations/templates/route.ts",
  );

const updateTemplate =
  read(
    "src/app/api/internal/operations/templates/[templateId]/route.ts",
  );

const activateTemplate =
  read(
    "src/app/api/internal/operations/templates/[templateId]/activate/route.ts",
  );

has(
  createTemplate,
  "reconcileMissingFirstCardsForSchool",
  "template create/activate path recovers deferred first cards",
);

has(
  createTemplate,
  "firstCardRecovery",
  "template create/activate response exposes recovery result",
);

has(
  updateTemplate,
  "reconcileMissingFirstCardsForSchool",
  "template update/activate path recovers deferred first cards",
);

has(
  updateTemplate,
  "firstCardRecovery",
  "template update/activate response exposes recovery result",
);

has(
  activateTemplate,
  "reconcileInitialCardRollout",
  "standalone activation still invokes reconciliation service",
);

console.log(
  "GREEN: manual Create missing first card action is removed",
);
console.log(
  "GREEN: zero-card-history manual production is blocked at route/service boundary",
);
console.log(
  "GREEN: Passkey reissue remains available only for prior card history",
);
console.log(
  "GREEN: enrollment first-card provisioning remains automatic",
);
console.log(
  "GREEN: template create/update/activation recovers deferred first cards",
);
console.log(
  "GREEN: completed rollout no longer blocks automatic recovery",
);
console.log(
  "GREEN: post-rollout scheduled jobs are not force-released",
);
console.log(
  "RESULT: M63 FIRST-CARD AUTOMATIC RECOVERY CLOSURE GREEN",
);
