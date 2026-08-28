export type ScannerRequestedOperation =
  | "AUTO"
  | "CHECK_IN"
  | "CHECK_OUT";

export type ScannerResolvedOperation =
  | "CHECK_IN"
  | "CHECK_OUT";

export type ScannerPresenceState =
  | "ON_CAMPUS"
  | "SIGNED_OUT"
  | null;

export function resolveTerminalScanOperation(
  requested:
    ScannerRequestedOperation,
  currentPresence:
    ScannerPresenceState,
): ScannerResolvedOperation {
  if (
    requested ===
      "CHECK_IN" ||
    requested ===
      "CHECK_OUT"
  ) {
    return requested;
  }

  return currentPresence ===
    "ON_CAMPUS"
    ? "CHECK_OUT"
    : "CHECK_IN";
}