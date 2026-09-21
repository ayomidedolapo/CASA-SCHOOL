export type BiometricEnrollmentAction =
  | "BIOMETRIC_ENROLL"
  | "BIOMETRIC_REENROLL";

export type TerminalLifecycleAction =
  | "ROTATE_CREDENTIAL"
  | "ASSIGN_CAMPUS"
  | "SUSPEND"
  | "REACTIVATE"
  | "REVOKE";

export type TerminalPasskeyAction =
  | "TERMINAL_PROVISION"
  | "TERMINAL_ROTATE"
  | "TERMINAL_SUSPEND"
  | "TERMINAL_REACTIVATE"
  | "TERMINAL_REVOKE";

export function biometricEnrollmentAction(
  hasActiveProfile: boolean,
): BiometricEnrollmentAction {
  return hasActiveProfile
    ? "BIOMETRIC_REENROLL"
    : "BIOMETRIC_ENROLL";
}

export function terminalPasskeyAction(
  action:
    TerminalLifecycleAction,
): TerminalPasskeyAction {
  const mapping:
    Record<
      TerminalLifecycleAction,
      TerminalPasskeyAction
    > = {
      ROTATE_CREDENTIAL:
        "TERMINAL_ROTATE",
      ASSIGN_CAMPUS:
        "TERMINAL_PROVISION",
      SUSPEND:
        "TERMINAL_SUSPEND",
      REACTIVATE:
        "TERMINAL_REACTIVATE",
      REVOKE:
        "TERMINAL_REVOKE",
    };

  return mapping[action];
}

export function terminalActionNeedsReason(
  action:
    TerminalLifecycleAction,
): boolean {
  return action ===
    "REVOKE";
}