import {
  canCheckOut,
  classifyCheckIn,
  classifyCheckOut,
} from "../src/server/attendance/presence";

function assertEqual<T>(
  actual: T,
  expected: T,
  label: string,
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(
        expected,
      )}, got ${String(actual)}`,
    );
  }
}

assertEqual(
  classifyCheckIn(
    "06:59",
    "07:00",
    "07:45",
    "09:00",
  ),
  "BEFORE_WINDOW",
  "check-in before open",
);

assertEqual(
  classifyCheckIn(
    "07:45",
    "07:00",
    "07:45",
    "09:00",
  ),
  "ON_TIME",
  "check-in on-time boundary",
);

assertEqual(
  classifyCheckIn(
    "08:10",
    "07:00",
    "07:45",
    "09:00",
  ),
  "LATE",
  "late check-in",
);

assertEqual(
  classifyCheckIn(
    "09:01",
    "07:00",
    "07:45",
    "09:00",
  ),
  "OUTSIDE_WINDOW",
  "check-in after close",
);

assertEqual(
  classifyCheckOut(
    "13:30",
    "14:00",
    "17:00",
  ),
  "EARLY",
  "early departure",
);

assertEqual(
  classifyCheckOut(
    "14:00",
    "14:00",
    "17:00",
  ),
  "NORMAL",
  "dismissal boundary",
);

assertEqual(
  classifyCheckOut(
    "17:01",
    "14:00",
    "17:00",
  ),
  "OUTSIDE_WINDOW",
  "departure after window",
);

assertEqual(
  canCheckOut("ON_CAMPUS"),
  true,
  "on-campus student may check out",
);

assertEqual(
  canCheckOut("SIGNED_OUT"),
  false,
  "signed-out student may not duplicate check out",
);

console.log(
  "CASA School attendance presence self-test passed.",
);