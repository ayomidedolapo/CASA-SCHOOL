import fs from "node:fs";

function read(
  path: string,
) {
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

function requireText(
  source: string,
  marker: string,
  label: string,
) {
  if (
    !source.includes(
      marker,
    )
  ) {
    throw new Error(
      `${label}: missing ${marker}`,
    );
  }
}

const schedule =
  read(
    "src/server/card-production/scheduled-card-policy.ts",
  );

for (
  const marker of [
    "current_term.ends_on",
    "current_term.school_today >",
    "listScheduledFirstCardGroups",
    "job.queued_at >",
    "SCHOOL_ENROLLMENT_AUTO_ISSUE",
    "READY_FOR_ACTIVATION",
    "jsonb_agg",
  ]
) {
  requireText(
    schedule,
    marker,
    "term-end first-card scheduling",
  );
}

const lifecycle =
  read(
    "src/server/card-production/m38-lifecycle.ts",
  );

for (
  const marker of [
    "resolveFirstCardQueueSchedule",
    "queueSchedule.queueAt",
    "scheduledFor:",
  ]
) {
  requireText(
    lifecycle,
    marker,
    "first-card lifecycle scheduling",
  );
}

const production =
  read(
    "src/server/card-production/production.ts",
  );

for (
  const marker of [
    '"FIRST_CARD"',
    '"REPLACEMENT"',
    "exportableOnly",
    "includeScheduled",
    "studentIdentityCards.status",
    "READY_FOR_ACTIVATION",
    "queued_at <=",
    "CASA_INTERNAL_REPLACEMENT",
  ]
) {
  requireText(
    production,
    marker,
    "central card production hardening",
  );
}

const replacement =
  read(
    "src/server/card-production/replacement-batch.ts",
  );

for (
  const marker of [
    "jsonb_agg",
    "replacement_reason",
    "branchId",
    "current_class.branch_name",
  ]
) {
  requireText(
    replacement,
    marker,
    "replacement waiting-student details",
  );
}

const manifestRoute =
  read(
    "src/app/api/internal/operations/card-production/manifest/route.ts",
  );

for (
  const marker of [
    "category:",
    "exportableOnly: true",
    "Printed card history cannot be exported",
  ]
) {
  requireText(
    manifestRoute,
    marker,
    "safe filtered manifest",
  );
}

const manifest =
  read(
    "src/server/card-production/manifest.ts",
  );

for (
  const marker of [
    '"Card Type"',
    "NEW STUDENT / FIRST CARD",
    "REPLACEMENT",
  ]
) {
  requireText(
    manifest,
    marker,
    "manifest card category",
  );
}

const client =
  read(
    "src/app/internal/card-production/card-production-client.tsx",
  );

for (
  const marker of [
    "Scheduled term-end cards",
    "New students / first cards",
    "Lost & damaged replacements",
    "All card types",
    "New student / first card",
    "Export filtered XLSX",
    "future scheduled jobs",
    "linked card is LOST / REPLACED / REVOKED",
    "batch.students",
  ]
) {
  requireText(
    client,
    marker,
    "card-production organized UI",
  );
}

const registry =
  read(
    "src/app/schools/[slug]/registry/registry-client.tsx",
  );

for (
  const marker of [
    "scheduledFor",
    "scheduled for term-end production",
    "supervised first-card check-in and assisted sign-out",
  ]
) {
  requireText(
    registry,
    marker,
    "school mid-term first-card guidance",
  );
}

const operational =
  read(
    "src/server/internal/operational-reconcile.ts",
  );

for (
  const marker of [
    "join student_identity_cards card",
    "card.status =",
    "job.queued_at <=",
  ]
) {
  requireText(
    operational,
    marker,
    "production backlog guard",
  );
}

console.log(
  "CASA M46B card-production batching/export hardening self-test passed.",
);
