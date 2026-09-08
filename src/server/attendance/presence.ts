export type CheckInClassification =
  | "BEFORE_WINDOW"
  | "ON_TIME"
  | "LATE"
  | "OUTSIDE_WINDOW";

export type CheckOutClassification =
  | "EARLY"
  | "NORMAL"
  | "OUTSIDE_WINDOW";

function clockToSeconds(
  value: string,
): number {
  const match =
    /^(?:([01]\d|2[0-3])):([0-5]\d)(?::([0-5]\d))?$/.exec(
      value,
    );

  if (!match) {
    throw new Error(
      `Invalid HH:MM or HH:MM:SS clock value: ${value}`,
    );
  }

  return (
    Number(match[1]) *
      60 *
      60 +
    Number(match[2]) *
      60 +
    Number(
      match[3] ??
        "0",
    )
  );
}

export function classifyCheckIn(
  clock: string,
  opensAt: string,
  onTimeUntil: string,
  closesAt: string,
): CheckInClassification {
  const clockSeconds =
    clockToSeconds(
      clock,
    );

  const opensAtSeconds =
    clockToSeconds(
      opensAt,
    );

  const onTimeUntilSeconds =
    clockToSeconds(
      onTimeUntil,
    );

  const closesAtSeconds =
    clockToSeconds(
      closesAt,
    );

  if (
    !(
      opensAtSeconds <=
        onTimeUntilSeconds &&
      onTimeUntilSeconds <=
        closesAtSeconds
    )
  ) {
    throw new Error(
      "Invalid check-in window ordering.",
    );
  }

  if (
    clockSeconds <
    opensAtSeconds
  ) {
    return "BEFORE_WINDOW";
  }

  if (
    clockSeconds <=
    onTimeUntilSeconds
  ) {
    return "ON_TIME";
  }

  if (
    clockSeconds <=
    closesAtSeconds
  ) {
    return "LATE";
  }

  return "OUTSIDE_WINDOW";
}

export function classifyCheckOut(
  clock: string,
  normalDismissalAt: string,
  checkOutClosesAt: string,
): CheckOutClassification {
  const clockSeconds =
    clockToSeconds(
      clock,
    );

  const normalDismissalSeconds =
    clockToSeconds(
      normalDismissalAt,
    );

  const checkOutClosesSeconds =
    clockToSeconds(
      checkOutClosesAt,
    );

  if (
    normalDismissalSeconds >
    checkOutClosesSeconds
  ) {
    throw new Error(
      "Invalid check-out window ordering.",
    );
  }

  if (
    clockSeconds <
    normalDismissalSeconds
  ) {
    return "EARLY";
  }

  if (
    clockSeconds <=
    checkOutClosesSeconds
  ) {
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