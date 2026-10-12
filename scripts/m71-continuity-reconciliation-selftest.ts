import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function expect(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const scanner = source("src/app/scanner/scanner-client.tsx");
const storage = source("src/scanner/continuity-storage.ts");
const sync = source("src/server/attendance/continuity-sync.ts");
const route = source("src/app/api/terminal/continuity/sync/route.ts");
const m70 = source("scripts/m70-continuity-online-race-selftest.ts");
const temporaryExit = source("src/server/attendance/temporary-exit.ts");
const guardianPresence = source("src/server/messaging/guardian-presence-push.ts");
const guardianWorker = source("src/server/messaging/guardian-push-worker.ts");

expect(
  scanner.includes('"2026-10-12-m71-continuity-reconciliation-closure"'),
  "Scanner M71 revision marker is missing.",
);

expect(
  storage.includes("movement?:") &&
  storage.includes("recoveryRevision?:") &&
  storage.includes("recoverySourceRequestId?:") &&
  storage.includes("crypto.randomUUID()") &&
  storage.includes("store.delete(") &&
  storage.includes("recoveryRevision !=="),
  "M71 one-time historical recovery is not re-keyed safely.",
);

const recoveryStart = scanner.indexOf("await recoverRejectedContinuityEvents(");
const recoveryEnd = scanner.indexOf("const rows =", recoveryStart);
const recoveryBlock =
  recoveryStart >= 0 && recoveryEnd > recoveryStart
    ? scanner.slice(recoveryStart, recoveryEnd)
    : "";

for (const code of [
  "TEMPORARY_RETURN_REQUIRES_FRESH_SCAN",
  "CONTINUITY_TEMPORARY_EXIT_STATE_INVALID",
  "CONTINUITY_TEMPORARY_RETURN_STATE_INVALID",
  "CONTINUITY_ATTEMPT_CONFLICT",
  "FINALIZATION_STATE_CONFLICT",
  "CONTINUITY_SYNC_CONFLICT",
  "TEMPORARY_MOVEMENT_STATE_CHANGED",
]) {
  expect(
    recoveryBlock.includes(`"${code}"`),
    `Bug-derived historical recovery code missing: ${code}`,
  );
}

for (const code of [
  "EARLY_DEPARTURE_AUTH_REQUIRED",
  "REENTRY_NOT_ENABLED",
  "NOT_CHECKED_IN",
  "CONTINUITY_EVENT_ORDER_INVALID",
]) {
  expect(
    !recoveryBlock.includes(`"${code}"`),
    `Genuine policy/order rejection must not be auto-retried: ${code}`,
  );
}

expect(
  scanner.includes('| "SUPERSEDED"') &&
  scanner.includes(
    'result.status ===\n                      "SUPERSEDED"',
  ),
  "Scanner does not settle server-proven superseded rows.",
);

expect(
  scanner.includes(
    "settled.length ===\n                0 &&\n              rejected.length ===\n                0",
  ),
  "A rejected oldest row can still block the next valid pending event.",
);

expect(
  sync.includes('status:\n        "SUPERSEDED"') &&
  sync.includes("CONTINUITY_SUPERSEDED_BY_AUTHORITATIVE_STATE"),
  "Server SUPERSEDED result is missing.",
);

const cycleStart = sync.indexOf("  const temporaryExitCycle =");
const cycleEnd = sync.indexOf("  const movementResolution =", cycleStart);
const cycleBlock =
  cycleStart >= 0 && cycleEnd > cycleStart
    ? sync.slice(cycleStart, cycleEnd)
    : "";

const normalizedCycle = cycleBlock.replace(/\s+/g, " ");

expect(
  normalizedCycle.includes(
    'status: | "AUTHORIZED" | "OUTSIDE" | "RETURNED";',
  ) &&
  normalizedCycle.includes("cycle.returned_at") &&
  normalizedCycle.includes("'RETURNED'"),
  "Completed temporary cycles are not visible to reconciliation.",
);

expect(
  normalizedCycle.includes(
    'input.movement === "TEMPORARY_EXIT"',
  ) &&
  normalizedCycle.includes("capturedAt >= cycleCreatedAt") &&
  normalizedCycle.includes(
    'temporaryExitCycle.status === "OUTSIDE" || temporaryExitCycle.status === "RETURNED"',
  ),
  "Temporary-exit supersession is not tied to the same authorized cycle.",
);

expect(
  normalizedCycle.includes(
    'input.movement === "TEMPORARY_RETURN"',
  ) &&
  normalizedCycle.includes(
    'temporaryExitCycle?.status === "RETURNED"',
  ) &&
  normalizedCycle.includes("capturedAt >= steppedOutAt"),
  "Temporary-return supersession is not tied to the same stepped-out cycle.",
);

const guardStart = sync.indexOf("  const protectedOnlineAttempt =");
const guardEnd = sync.indexOf("  let timeResult:", guardStart);
const guardBlock =
  guardStart >= 0 && guardEnd > guardStart
    ? sync.slice(guardStart, guardEnd)
    : "";

expect(
  guardBlock.includes("interval '2 minutes'") &&
  guardBlock.includes("biometric_liveness_sessions") &&
  !guardBlock.includes("${input.capturedAt}::timestamptz"),
  "An abandoned old online attempt can still defer an older continuity row forever.",
);

expect(
  !sync.includes("CONNECTIVITY_CONTINUITY_SUPERSEDED") &&
  !sync.includes(
    "update attendance_verification_attempts\n      attempt\n    set\n      face_result =\n        'UNAVAILABLE'",
  ),
  "Continuity must not mutate unrelated online attempts.",
);

expect(
  /!guardBlock\.includes\([\s\S]{0,180}"attempt\.occurred_at >\\n\s+\$\{input\.capturedAt\}::timestamptz"/
    .test(m70),
  "M70 proof was not migrated to the no-permanent-deferral contract.",
);

expect(
  route.includes('result.status !==\n        "RECORDED"') &&
  sync.includes("queueTemporaryMovementNotification") &&
  sync.includes("queueGuardianPresencePushBestEffort") &&
  sync.includes("queueSchoolMovementNotifications") &&
  temporaryExit.includes("STUDENT_TEMPORARILY_OUT") &&
  temporaryExit.includes("STUDENT_RETURNED_TO_CAMPUS") &&
  guardianPresence.includes("STUDENT_TEMPORARILY_OUT") &&
  guardianPresence.includes("STUDENT_RETURNED_TO_CAMPUS") &&
  guardianWorker.includes("presenceEventId"),
  "Notification queueing/dedup boundaries regressed.",
);

console.log("M71 CONTINUITY RECONCILIATION CLOSURE SELFTEST = GREEN");
