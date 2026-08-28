import {
  biometricEnrollmentAction,
  terminalActionNeedsReason,
  terminalPasskeyAction,
} from "../src/technician/operations";

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
  biometricEnrollmentAction(
    false,
  ),
  "BIOMETRIC_ENROLL",
  "first biometric enrollment action",
);

assertEqual(
  biometricEnrollmentAction(
    true,
  ),
  "BIOMETRIC_REENROLL",
  "replacement biometric enrollment action",
);

assertEqual(
  terminalPasskeyAction(
    "ROTATE_CREDENTIAL",
  ),
  "TERMINAL_ROTATE",
  "terminal rotate Passkey action",
);

assertEqual(
  terminalPasskeyAction(
    "SUSPEND",
  ),
  "TERMINAL_SUSPEND",
  "terminal suspend Passkey action",
);

assertEqual(
  terminalPasskeyAction(
    "REACTIVATE",
  ),
  "TERMINAL_REACTIVATE",
  "terminal reactivate Passkey action",
);

assertEqual(
  terminalPasskeyAction(
    "REVOKE",
  ),
  "TERMINAL_REVOKE",
  "terminal revoke Passkey action",
);

assertEqual(
  terminalActionNeedsReason(
    "REVOKE",
  ),
  true,
  "terminal revoke reason",
);

assertEqual(
  terminalActionNeedsReason(
    "SUSPEND",
  ),
  false,
  "terminal suspend optional reason",
);

console.log(
  "CASA School Technician identity-operations self-test passed.",
);