import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
  "utf8",
);

for (const marker of [
  "type AttendanceDayTimes =",
  "createDefaultAttendanceDayTimes",
  "dayTimes[",
  "setDayTimes(",
  "Saturday lessons",
  "There is lesson on Saturday",
  "No lesson on Saturday",
  "Each instructional weekday has its own attendance times.",
]) {
  assert.ok(
    ui.includes(marker),
    `Attendance Saturday control missing ${marker}`,
  );
}

assert.ok(
  ui.includes(
    "current.includes(\n                            6",
  ),
  "Saturday ON must add weekday 6.",
);

assert.ok(
  ui.includes(
    "weekday !==\n                              6",
  ),
  "Saturday OFF must remove weekday 6.",
);

assert.ok(
  !ui.includes(`              {[
                1,
                2,
                3,
                4,
                5,
                6,
                0,
              ].map(`),
  "Saturday must not remain in the generic weekday selector.",
);

assert.ok(
  ui.includes(
    "When Saturday is OFF, Saturday is not an instructional day and students are not expected for attendance.",
  ),
  "Saturday OFF explanatory contract missing.",
);

console.log(
  "CASA explicit Saturday Lessons ON/OFF self-test passed.",
);
