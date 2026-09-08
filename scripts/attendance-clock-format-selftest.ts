import {
  classifyCheckIn,
  classifyCheckOut,
} from "../src/server/attendance/presence";

function assertEqual<T>(
  actual: T,
  expected: T,
  label: string,
): void {
  if (
    actual !==
    expected
  ) {
    throw new Error(
      `${label}: expected ${String(
        expected,
      )}, got ${String(
        actual,
      )}`,
    );
  }
}

function assertThrows(
  action:
    () =>
      unknown,
  label:
    string,
): void {
  let threw =
    false;

  try {
    action();
  } catch {
    threw =
      true;
  }

  if (!threw) {
    throw new Error(
      `${label}: expected an error`,
    );
  }
}

// Exact controlled Development policy shape from the
// failed real scanner proof: browser clock at minute
// precision, PostgreSQL TIME values at second precision.
assertEqual(
  classifyCheckIn(
    "05:22",
    "00:00:00",
    "23:30:00",
    "23:40:00",
  ),
  "ON_TIME",
  "mixed HH:MM browser clock and HH:MM:SS policy",
);

assertEqual(
  classifyCheckIn(
    "23:30:00",
    "00:00",
    "23:30",
    "23:40",
  ),
  "ON_TIME",
  "second-precision on-time boundary",
);

assertEqual(
  classifyCheckIn(
    "23:30:01",
    "00:00:00",
    "23:30:00",
    "23:40:00",
  ),
  "LATE",
  "one second after on-time boundary",
);

assertEqual(
  classifyCheckIn(
    "23:40:01",
    "00:00:00",
    "23:30:00",
    "23:40:00",
  ),
  "OUTSIDE_WINDOW",
  "one second after check-in close",
);

// Legacy HH:MM behavior must remain identical.
assertEqual(
  classifyCheckIn(
    "08:10",
    "07:00",
    "07:45",
    "09:00",
  ),
  "LATE",
  "legacy HH:MM check-in preserved",
);

assertEqual(
  classifyCheckOut(
    "14:00",
    "14:00:00",
    "17:00:00",
  ),
  "NORMAL",
  "mixed check-out clock precision",
);

assertEqual(
  classifyCheckOut(
    "13:59:59",
    "14:00:00",
    "17:00:00",
  ),
  "EARLY",
  "second-precision early departure",
);

assertThrows(
  () =>
    classifyCheckIn(
      "08:00",
      "09:00:00",
      "08:30:00",
      "10:00:00",
    ),
  "invalid check-in ordering remains rejected",
);

for (
  const invalid of [
    "24:00",
    "07:60",
    "07:30:60",
    "7:30",
    "07:30:00.500",
  ]
) {
  assertThrows(
    () =>
      classifyCheckIn(
        invalid,
        "07:00:00",
        "07:45:00",
        "09:00:00",
      ),
    `invalid clock ${invalid}`,
  );
}

console.log(
  "CASA School PostgreSQL TIME attendance clock regression self-test passed.",
);