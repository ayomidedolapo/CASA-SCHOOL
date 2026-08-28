export type TodayPresenceStatus =
  | "NOT_ARRIVED"
  | "ABSENT"
  | "ON_CAMPUS"
  | "SIGNED_OUT";

export type TodayAttendanceView =
  | "ALL"
  | "NOT_ARRIVED"
  | "ABSENT"
  | "ON_CAMPUS"
  | "SIGNED_OUT"
  | "LATE";

export function classifyTodayPresence(
  input: {
    hasAttendanceRecord:
      boolean;
    presenceState:
      | "ON_CAMPUS"
      | "SIGNED_OUT"
      | null;
    schoolClock:
      string;
    checkInClosesAt:
      string | null;
  },
): TodayPresenceStatus {
  if (
    input.hasAttendanceRecord
  ) {
    return input.presenceState ===
      "SIGNED_OUT"
      ? "SIGNED_OUT"
      : "ON_CAMPUS";
  }

  if (
    input.checkInClosesAt &&
    input.schoolClock >
      input.checkInClosesAt.slice(
        0,
        5,
      )
  ) {
    return "ABSENT";
  }

  return "NOT_ARRIVED";
}

export function isTodayView(
  value: string,
): value is
  TodayAttendanceView {
  return [
    "ALL",
    "NOT_ARRIVED",
    "ABSENT",
    "ON_CAMPUS",
    "SIGNED_OUT",
    "LATE",
  ].includes(value);
}