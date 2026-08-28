import {
  classifyTodayPresence,
  isTodayView,
} from "../src/server/attendance/operations";

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

assertEqual(
  classifyTodayPresence({
    hasAttendanceRecord:
      false,
    presenceState:
      null,
    schoolClock:
      "08:30",
    checkInClosesAt:
      "09:00:00",
  }),
  "NOT_ARRIVED",
  "student before arrival close",
);

assertEqual(
  classifyTodayPresence({
    hasAttendanceRecord:
      false,
    presenceState:
      null,
    schoolClock:
      "09:01",
    checkInClosesAt:
      "09:00:00",
  }),
  "ABSENT",
  "student after arrival close",
);

assertEqual(
  classifyTodayPresence({
    hasAttendanceRecord:
      true,
    presenceState:
      "ON_CAMPUS",
    schoolClock:
      "10:00",
    checkInClosesAt:
      "09:00:00",
  }),
  "ON_CAMPUS",
  "accepted on-campus record",
);

assertEqual(
  classifyTodayPresence({
    hasAttendanceRecord:
      true,
    presenceState:
      "SIGNED_OUT",
    schoolClock:
      "15:00",
    checkInClosesAt:
      "09:00:00",
  }),
  "SIGNED_OUT",
  "accepted sign-out record",
);

assertEqual(
  isTodayView(
    "LATE",
  ),
  true,
  "late filter",
);

assertEqual(
  isTodayView(
    "UNTRUSTED",
  ),
  false,
  "invalid filter",
);

console.log(
  "CASA School attendance operations self-test passed.",
);