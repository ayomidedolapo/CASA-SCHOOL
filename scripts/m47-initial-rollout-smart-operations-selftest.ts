import assert from "node:assert/strict";
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

const schools =
  read(
    "src/db/schema/schools.ts",
  );

for (
  const marker of [
    "initialCardRolloutCompletedAt",
    "initial_card_rollout_completed_at",
    "initialCardRolloutCompletedByInternalMembershipId",
  ]
) {
  has(
    schools,
    marker,
    "rollout school schema",
  );
}

const schedule =
  read(
    "src/server/card-production/scheduled-card-policy.ts",
  );

for (
  const marker of [
    "initial_card_rollout_completed_at",
    "current_term.school_today >",
    "current_term.ends_on",
  ]
) {
  has(
    schedule,
    marker,
    "rollout scheduling cutoff",
  );
}

const lifecycle =
  read(
    "src/server/card-production/m38-lifecycle.ts",
  );

for (
  const marker of [
    "CASA_INTERNAL_INITIAL_ROLLOUT",
    "ensureFirstStudentCardForEnrollmentInternal",
    "actorMembershipId",
    "productionAuthority",
  ]
) {
  has(
    lifecycle,
    marker,
    "initial rollout issuance authority",
  );
}

const productionSchema =
  read(
    "src/db/schema/card-production.ts",
  );
has(
  productionSchema,
  "CASA_INTERNAL_INITIAL_ROLLOUT",
  "card production authority schema",
);

const production =
  read(
    "src/server/card-production/production.ts",
  );

for (
  const marker of [
    "CASA_INTERNAL_INITIAL_ROLLOUT",
    "FIRST_CARD",
  ]
) {
  has(
    production,
    marker,
    "central first-card classification",
  );
}

const rollout =
  read(
    "src/server/card-production/initial-rollout.ts",
  );

for (
  const marker of [
    "getInitialCardRolloutState",
    "reconcileInitialCardRollout",
    "reconcilePendingInitialCardRollouts",
    "completeInitialCardRollout",
    "scheduledFirstCards",
    "canComplete",
  ]
) {
  has(
    rollout,
    marker,
    "initial rollout service",
  );
}

const route =
  read(
    "src/app/api/internal/platform/schools/[schoolId]/card-rollout/complete/route.ts",
  );

for (
  const marker of [
    "requireCasaSuperAdmin",
    "z.literal",
    "INITIAL_CARD_ROLLOUT_COMPLETED",
  ]
) {
  has(
    route,
    marker,
    "Super Admin rollout completion route",
  );
}

const client =
  read(
    "src/app/internal/schools/[schoolId]/school-detail-client.tsx",
  );

for (
  const marker of [
    "Complete initial card rollout",
    "Complete initial card rollout?",
    "CasaConfirmDialog",
    "CASA Super Admin",
    "future mid-term admissions",
  ]
) {
  has(
    client,
    marker,
    "rollout confirmation UX",
  );
}

const attendance =
  read(
    "src/server/attendance/today.ts",
  );

for (
  const marker of [
    "card_replacement_payment_status",
    "card_replacement_reason",
    "paymentStatus",
    "replacementReason",
    "presenceStatus",
  ]
) {
  has(
    attendance,
    marker,
    "lost-card presence board data",
  );
}

const attendanceClient =
  read(
    "src/app/schools/[slug]/attendance/attendance-client.tsx",
  );

for (
  const marker of [
    "paymentStatus",
    "replacementReason",
    "supervised attendance",
  ]
) {
  has(
    attendanceClient,
    marker,
    "lost-card board clarity",
  );
}

const smart =
  read(
    "src/server/notifications/smart-operations.ts",
  );

for (
  const marker of [
    "CARD_REPLACEMENT_GRACE_ENDING",
    "CARD_REPLACEMENT_PAYMENT_OVERDUE",
    "ATTENDANCE_SESSION_STALE_OPEN",
    "INITIAL_CARD_ROLLOUT_TEMPLATE_MISSING",
    "INITIAL_CARD_ROLLOUT_BACKFILL_PENDING",
    "INITIAL_CARD_ROLLOUT_READY",
    "countInstructionalGraceDays",
    "SCHOOL_OPERATOR",
  ]
) {
  has(
    smart,
    marker,
    "smart operational notifier",
  );
}

const operational =
  read(
    "src/server/internal/operational-reconcile.ts",
  );
has(
  operational,
  "reconcileSmartOperationalRisks",
  "Platform Control risk reconciliation",
);

const schoolActivity =
  read(
    "src/server/notifications/school-activity.ts",
  );
has(
  schoolActivity,
  "reconcileSmartOperationalRisks",
  "school risk reconciliation",
);

const cron =
  read(
    "src/app/api/internal/jobs/guardian-push/route.ts",
  );

for (
  const marker of [
    "reconcilePendingInitialCardRollouts",
    "reconcileCasaOperationalNotifications",
    "rolloutReconciliation",
    "operationalReconciliation",
  ]
) {
  has(
    cron,
    marker,
    "background proactive reconciliation",
  );
}

console.log(
  "CASA M47 initial rollout + smart operations source self-test passed.",
);
