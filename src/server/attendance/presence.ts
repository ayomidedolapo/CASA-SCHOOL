export type CheckInClassification =
  | "BEFORE_WINDOW"
  | "ON_TIME"
  | "LATE"
  | "OUTSIDE_WINDOW";

export type CheckOutClassification =
  | "EARLY"
  | "NORMAL"
  | "OUTSIDE_WINDOW";

function assertClock(value: string): void {
  if (
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(
      value,
    )
  ) {
    throw new Error(
      `Invalid HH:MM clock value: ${value}`,
    );
  }
}

export function classifyCheckIn(
  clock: string,
  opensAt: string,
  onTimeUntil: string,
  closesAt: string,
): CheckInClassification {
  [
    clock,
    opensAt,
    onTimeUntil,
    closesAt,
  ].forEach(assertClock);

  if (
    !(
      opensAt <= onTimeUntil &&
      onTimeUntil <= closesAt
    )
  ) {
    throw new Error(
      "Invalid check-in window ordering.",
    );
  }

  if (clock < opensAt) {
    return "BEFORE_WINDOW";
  }

  if (clock <= onTimeUntil) {
    return "ON_TIME";
  }

  if (clock <= closesAt) {
    return "LATE";
  }

  return "OUTSIDE_WINDOW";
}

export function classifyCheckOut(
  clock: string,
  normalDismissalAt: string,
  checkOutClosesAt: string,
): CheckOutClassification {
  [
    clock,
    normalDismissalAt,
    checkOutClosesAt,
  ].forEach(assertClock);

  if (
    normalDismissalAt >
    checkOutClosesAt
  ) {
    throw new Error(
      "Invalid check-out window ordering.",
    );
  }

  if (clock < normalDismissalAt) {
    return "EARLY";
  }

  if (clock <= checkOutClosesAt) {
    return "NORMAL";
  }

  return "OUTSIDE_WINDOW";
}

export function canCheckOut(
  presenceState:
    | "ON_CAMPUS"
    | "SIGNED_OUT",
): boolean {
  return presenceState === "ON_CAMPUS";
}