import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p: string) =>
  fs.readFileSync(p, "utf8");

const migration = read(
  "drizzle/20261005013000_m57_attendance_safety_temporary_exit/migration.sql",
);
const temp = read(
  "src/server/attendance/temporary-exit.ts",
);
const scan = read(
  "src/app/api/terminal/scan/route.ts",
);
const dispatch = read(
  "src/server/attendance/finalize-presence-dispatch.ts",
);
const guardian = read(
  "src/server/messaging/guardian-presence-push.ts",
);
const late = read(
  "src/server/attendance/supervised-arrival.ts",
);
const assisted = read(
  "src/server/attendance/assisted-checkout.ts",
);
const today = read(
  "src/server/attendance/today.ts",
);
const ui = read(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
);
const scanner = read(
  "src/app/scanner/scanner-client.tsx",
);

for (const marker of [
  "TEMPORARY_EXITED",
  "TEMPORARY_RETURNED",
  "student_temporary_exit_cycles",
  "student_temporary_exit_cycles_one_open_idx",
  "STUDENT_TEMPORARILY_OUT",
  "STUDENT_RETURNED_TO_CAMPUS",
]) {
  assert.ok(
    migration.includes(marker),
    `M57 migration missing ${marker}`,
  );
}

assert.doesNotMatch(
  migration,
  /\bdelete\s+from\b|\btruncate\b/i,
  "M57 migration must not delete historical attendance.",
);

assert.ok(
  temp.includes('"TEMPORARY_EXIT"') &&
    temp.includes('"TEMPORARY_RETURN"'),
  "Temporary movement finalizer must distinguish exit and return.",
);
assert.ok(
  temp.includes("ACTIVE student card is required"),
  "Temporary exit must require an ACTIVE card.",
);
assert.ok(
  temp.includes("ACTIVE biometric profile is required"),
  "Temporary exit must require an ACTIVE biometric profile.",
);
assert.ok(
  temp.includes("consumePasskeyStepUpGrantWithId") &&
    temp.includes('action: "TEMPORARY_EXIT"'),
  "Temporary exit authorization must require Passkey step-up.",
);
assert.doesNotMatch(
  temp,
  /presence_state\s*=\s*'SIGNED_OUT'/,
  "Temporary movement must never sign the daily attendance record out.",
);
assert.doesNotMatch(
  temp,
  /checked_out_at\s*=/,
  "Temporary movement must never set final checkout time.",
);
assert.ok(
  temp.includes("queueSchoolMovementNotifications"),
  "School Owner/Admin/Technician notifications are required.",
);
assert.ok(
  temp.includes("runGuardianPushOutbox"),
  "Temporary movement must trigger the existing M53/M55 push worker.",
);

assert.ok(
  scan.includes("TEMPORARY_EXIT_AUTHORIZED") &&
    scan.includes("TEMPORARY_RETURN_AUTHORIZED"),
  "Scanner must recognize both temporary directions.",
);
assert.ok(
  dispatch.includes("finalizeTemporaryMovement"),
  "Temporary scans must use the isolated temporary movement finalizer.",
);

assert.ok(
  guardian.includes("STUDENT_TEMPORARILY_OUT") &&
    guardian.includes("STUDENT_RETURNED_TO_CAMPUS"),
  "Guardian push must support step-out and return.",
);
assert.ok(
  guardian.includes("expected back on campus soon") &&
    guardian.includes("is now back on the school campus"),
  "Guardian wording must distinguish temporary movement.",
);

assert.match(
  late,
  /recordSupervisedLateArrival[\s\S]*requireActiveBiometricProfile/,
  "Record Late must require an ACTIVE biometric profile.",
);
assert.match(
  late,
  /recordSupervisedLateArrival[\s\S]*runGuardianPushOutbox/,
  "Record Late must immediately invoke the guardian push worker.",
);
assert.match(
  assisted,
  /queueGuardianPresencePushBestEffort[\s\S]*runGuardianPushOutbox/,
  "Assisted sign-out must immediately invoke the guardian push worker.",
);

assert.ok(
  today.includes("TEMPORARILY_OUT") &&
    today.includes("temporaryExit"),
  "Attendance Today must expose temporary movement state.",
);
assert.ok(
  ui.includes("Authorize step-out") &&
    ui.includes('"TEMPORARY_EXIT"'),
  "Attendance UI must expose one-cycle temporary step-out authorization.",
);
assert.ok(
  scanner.includes("Stepped out temporarily") &&
    scanner.includes("Returned to campus"),
  "Scanner result must never mislabel temporary movement as final sign-out.",
);

console.log("RESULT: M57 TEMPORARY STEP-OUT + RETURN GREEN");
console.log("RESULT: M57 GUARDIAN + SCHOOL MOVEMENT NOTIFICATIONS GREEN");
console.log("RESULT: M57 RECORD LATE BIOMETRIC + IMMEDIATE PUSH GREEN");
console.log("RESULT: M57 ASSISTED SIGN-OUT IMMEDIATE PUSH GREEN");
console.log("RESULT: M57 FINAL SIGN-OUT SEMANTICS UNCHANGED GREEN");
