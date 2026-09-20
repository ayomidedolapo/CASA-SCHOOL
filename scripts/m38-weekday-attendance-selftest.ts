import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
  "utf8",
);

const policy = fs.readFileSync(
  "src/server/attendance/policy-management.ts",
  "utf8",
);

for (const marker of [
  "type AttendanceDayTimes =",
  "createDefaultAttendanceDayTimes",
  "dayTimes[",
  "setDayTimes(",
  "Each selected weekday has its own attendance times.",
  "Special non-instructional day",
  "weekdayLabels[",
]) {
  assert.ok(
    ui.includes(marker),
    `Attendance weekday UI missing ${marker}`,
  );
}

assert.ok(
  !ui.includes("const representativeDay ="),
  "Attendance UI must not collapse persisted weekday schedules into one representative day.",
);

assert.ok(
  !ui.includes("...times,"),
  "Attendance policy creation must not send one shared time set for every weekday.",
);

for (const marker of [
  "weekday: number;",
  "checkInOpensAt: string;",
  "onTimeUntil: string;",
  "checkInClosesAt: string;",
  "normalDismissalAt: string;",
  "checkOutClosesAt: string;",
  "attendancePolicyDays.weekday",
  "attendancePolicyDays.normalDismissalAt",
  "attendancePolicyDays.checkOutClosesAt",
]) {
  assert.ok(
    policy.includes(marker),
    `Attendance backend per-weekday contract missing ${marker}`,
  );
}

console.log(
  "CASA weekday-specific Attendance schedule self-test passed.",
);
