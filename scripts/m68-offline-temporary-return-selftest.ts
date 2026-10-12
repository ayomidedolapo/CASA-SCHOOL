import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}
function expect(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const bootstrap = source("src/app/api/terminal/continuity/bootstrap/route.ts");
const storage = source("src/scanner/continuity-storage.ts");
const card = source("src/scanner/continuity-card.ts");
const scanner = source("src/app/scanner/scanner-client.tsx");
const sync = source("src/server/attendance/continuity-sync.ts");
const movementIntent = source("src/server/attendance/continuity-movement-intent.ts");
const temporaryExit = source("src/server/attendance/temporary-exit.ts");

expect(
  bootstrap.includes('"temporaryMovementStatus"') &&
  bootstrap.includes("cycle.status in (") &&
  bootstrap.includes("card.status =") &&
  bootstrap.includes("student.status =") &&
  bootstrap.includes("enrollment.status =") &&
  !bootstrap.includes("student_biometric_profiles"),
  "Offline cache eligibility/state proof failed.",
);

expect(
  storage.includes("temporaryMovementStatus") &&
  storage.includes('"TEMPORARY_RETURN"') &&
  storage.includes("recoverRejectedContinuityEvents"),
  "Continuity durable-state/recovery proof failed.",
);

expect(
  card.includes("effectiveTemporaryMovementStatus") &&
  card.includes("TEMPORARY_RETURN_SYNC_PENDING") &&
  card.includes('movement:\n        "TEMPORARY_RETURN"') &&
  card.includes('movement:\n        "TEMPORARY_EXIT"'),
  "Offline local temporary-movement decision proof failed.",
);

expect(
  sync.includes("CONNECTIVITY_CONTINUITY_TEMPORARY_RETURN") &&
  sync.includes("TEMPORARY_RETURNED") &&
  sync.includes("resolveContinuityMovementIntent") &&
  movementIntent.includes("CONTINUITY_TEMPORARY_RETURN_ORDER_INVALID") &&
  movementIntent.includes('"TEMPORARY_RETURN"') &&
  sync.includes("queueTemporaryMovementNotification") &&
  sync.includes("queueSchoolMovementNotifications") &&
  sync.includes("STUDENT_RETURNED_TO_CAMPUS") &&
  !sync.includes("TEMPORARY_RETURN_REQUIRES_FRESH_SCAN"),
  "Server temporary-return reconciliation/notification proof failed.",
);

expect(
  temporaryExit.includes("export async function queueSchoolMovementNotifications"),
  "School operator movement notification helper is not reusable by continuity.",
);

expect(
  scanner.includes("Offline attendance backup active") &&
  scanner.includes("Offline attendance backup unavailable") &&
  !scanner.includes("Continuity ready -") &&
  !scanner.includes("cards.length ?? 0") &&
  scanner.includes("Returned to campus") &&
  scanner.includes("Stepped out temporarily") &&
  scanner.includes("TEMPORARY_RETURN_REQUIRES_FRESH_SCAN"),
  "Scanner operational UX or legacy rejected-event recovery proof failed.",
);

console.log("M68 OFFLINE TEMPORARY RETURN + SCANNER UX SELFTEST = GREEN");
