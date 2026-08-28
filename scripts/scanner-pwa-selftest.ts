import {
  createScannerRequestId,
  isTerminalCredentialShape,
  scannerReasonMessage,
} from "../src/scanner/contracts";
import {
  resolveTerminalScanOperation,
} from "../src/server/attendance/scan-operation";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

assert(
  resolveTerminalScanOperation(
    "AUTO",
    null,
  ) === "CHECK_IN",
  "AUTO should check in a student with no current presence.",
);

assert(
  resolveTerminalScanOperation(
    "AUTO",
    "ON_CAMPUS",
  ) === "CHECK_OUT",
  "AUTO should sign out a student currently on campus.",
);

assert(
  resolveTerminalScanOperation(
    "AUTO",
    "SIGNED_OUT",
  ) === "CHECK_IN",
  "AUTO should resolve a signed-out student to check-in so re-entry policy rejects it.",
);

assert(
  resolveTerminalScanOperation(
    "CHECK_OUT",
    null,
  ) === "CHECK_OUT",
  "Explicit CHECK_OUT must remain explicit.",
);

assert(
  isTerminalCredentialShape(
    "CASAT1.00000000-0000-4000-8000-000000000001.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ),
  "Valid terminal credential shape was rejected.",
);

assert(
  !isTerminalCredentialShape(
    "CASAT1.00000000-0000-4000-8000-000000000001.short",
  ),
  "Short terminal credential was accepted.",
);

const requestId =
  createScannerRequestId();

assert(
  /^[A-Za-z0-9_-]{8,64}$/.test(
    requestId,
  ),
  "Scanner request ID does not satisfy terminal API idempotency format.",
);

assert(
  scannerReasonMessage(
    "EARLY_DEPARTURE_AUTH_REQUIRED",
  ).toLowerCase()
    .includes(
      "staff",
    ),
  "Early departure must surface staff authorization.",
);

console.log(
  "CASA School Scanner PWA contract self-test passed.",
);