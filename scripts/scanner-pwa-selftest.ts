import fs from "node:fs";

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

for (
  const [
    code,
    expected,
  ] of [
    [
      "TERMINAL_BRANCH_UNASSIGNED",
      "campus",
    ],
    [
      "ATTENDANCE_BRANCH_NOT_OPEN",
      "opened",
    ],
    [
      "ATTENDANCE_POLICY_DAY_MISSING",
      "policy",
    ],
    [
      "TERMINAL_BRANCH_MISMATCH",
      "different campus",
    ],
    [
      "NON_INSTRUCTIONAL_DAY",
      "non-instructional",
    ],
  ] as const
) {
  assert(
    scannerReasonMessage(
      code,
    )
      .toLowerCase()
      .includes(
        expected,
      ),
    `Scanner reason ${code} must explain ${expected}.`,
  );
}

assert(
  scannerReasonMessage(
    "UNMAPPED_SERVER_CODE",
    "Exact server diagnosis.",
  ) ===
    "Exact server diagnosis.",
  "Unknown scanner codes must retain the exact server diagnosis.",
);

const scannerClientSource =
  fs.readFileSync(
    "src/app/scanner/scanner-client.tsx",
    "utf8",
  );

const terminalSessionRouteSource =
  fs.readFileSync(
    "src/app/api/terminal/session/route.ts",
    "utf8",
  );

const branchSessionSource =
  fs.readFileSync(
    "src/server/attendance/branch-session.ts",
    "utf8",
  );

assert(
  /context\.session\.status\s*===\s*"CLOSED"[\s\S]*options\.allowClosedForLateStay\s*===\s*true/.test(
    branchSessionSource,
  ),
  "Authorized late-stay checkout must not require a policy-day row after the campus session closes.",
);

assert(
  terminalSessionRouteSource.includes(
    "allowClosedForLateStay",
  ),
  "Terminal session readiness must preserve authorized late-stay checkout after close.",
);

assert(
  scannerClientSource.includes(
    "data.lateStayOnly ===",
  ) &&
  scannerClientSource.includes(
    "true",
  ),
  "Scanner must remain available after close only for the explicit lateStayOnly path.",
);

assert(
  !/scannerCanAcceptCard[\s\S]{0,450}data\.session\?\.status\s*===\s*"CLOSED"/.test(
    scannerClientSource,
  ),
  "A CLOSED attendance session by itself must not keep the scanner camera live.",
);

assert(
  scannerClientSource.includes(
    "const handleDecoded =",
  ) &&
  scannerClientSource.includes(
    "onDecoded={",
  ) &&
  scannerClientSource.includes(
    "handleDecoded",
  ),
  "Fast READY-state refreshes must use a stable QR decoded callback.",
);

const scannerOperationalUxSource =
  fs.readFileSync(
    "src/app/scanner/scanner-client.tsx",
    "utf8",
  );

const terminalListRouteSource =
  fs.readFileSync(
    "src/app/api/schools/[slug]/attendance/terminals/route.ts",
    "utf8",
  );

const technicianSource =
  fs.readFileSync(
    "src/app/schools/[slug]/technician/technician-client.tsx",
    "utf8",
  );

for (
  const marker of [
    "Replace credential",
    "Paste the replacement scanner credential",
    "Attendance not prepared.",
    "Attendance not opened.",
    "Policy timetable missing.",
    "Reason:",
  ]
) {
  assert(
    scannerOperationalUxSource.includes(
      marker,
    ),
    `Scanner operational UX missing ${marker}`,
  );
}

assert(
  terminalListRouteSource.includes(
    'b.name as "branchName"',
  ),
  "Terminal management must return the assigned campus.",
);

assert(
  technicianSource.includes(
    "Campus:",
  ) &&
  technicianSource.includes(
    "terminal.branchName",
  ),
  "Technician workbench must show each scanner campus.",
);

const terminalLifecycleRouteSource =
  fs.readFileSync(
    "src/app/api/schools/[slug]/attendance/terminals/[terminalId]/route.ts",
    "utf8",
  );

const terminalValidationSource =
  fs.readFileSync(
    "src/server/attendance/validation.ts",
    "utf8",
  );

const technicianOperationsSource =
  fs.readFileSync(
    "src/technician/operations.ts",
    "utf8",
  );

for (
  const marker of [
    "TERMINAL_CAMPUS_REQUIRED",
    "school_branch_terminals",
    "selectedBranchId",
    "selectedBranchName",
  ]
) {
  assert(
    terminalListRouteSource.includes(
      marker,
    ),
    `New terminal provisioning must bind campus: ${marker}`,
  );
}

for (
  const marker of [
    "ASSIGN_CAMPUS",
    "assignTerminalToBranch",
    "listVisibleBranches",
    "TERMINAL_CAMPUS_SCOPE_DENIED",
  ]
) {
  assert(
    terminalLifecycleRouteSource.includes(
      marker,
    ),
    `Existing terminal campus repair missing ${marker}`,
  );
}

assert(
  terminalValidationSource.includes(
    '"ASSIGN_CAMPUS"',
  ) &&
  terminalValidationSource.includes(
    "branchId",
  ),
  "Terminal validation must carry campus assignment.",
);

assert(
  technicianOperationsSource.includes(
    "ASSIGN_CAMPUS:"
  ) &&
  technicianOperationsSource.includes(
    '"TERMINAL_PROVISION"',
  ),
  "Campus assignment must retain Passkey provisioning authority.",
);

for (
  const marker of [
    "Select campus",
    "Assign campus",
    "Change campus",
    "Legacy scanner: assign a campus",
    "newTerminalBranchId",
  ]
) {
  assert(
    technicianSource.includes(
      marker,
    ),
    `Technician terminal campus UX missing ${marker}`,
  );
}

const terminalScanRouteSource =
  fs.readFileSync(
    "src/app/api/terminal/scan/route.ts",
    "utf8",
  );

for (
  const marker of [
    "hasActiveLateStayAuthorizationForBranchSession",
    "lateStayOnly",
  ]
) {
  assert(
    terminalSessionRouteSource.includes(
      marker,
    ),
    `Terminal session late-stay gating missing ${marker}`,
  );
}

assert(
  scannerClientSource.includes(
    'data.lateStayOnly ==='
  ) &&
  !/data\.session\?\.status\s*===\s*"CLOSED"[\s\S]{0,120}scannerCanAcceptCard/.test(
    scannerClientSource,
  ),
  "Closed attendance must not keep the camera live merely because status is CLOSED.",
);

for (
  const marker of [
    "This card is being processed as CHECK-IN",
    "Normal dismissal at",
    "Supervised late arrival",
    "CHECK_OUT_WINDOW_CLOSED",
    "terminalAttemptMessage",
  ]
) {
  assert(
    terminalScanRouteSource.includes(
      marker,
    ),
    `Scanner window explanation missing ${marker}`,
  );
}

assert(
  scannerReasonMessage(
    "CHECK_IN_WINDOW_CLOSED",
    "Exact effective policy explanation.",
  ) ===
    "Exact effective policy explanation.",
  "Scanner must prefer an exact server-side policy-window explanation.",
);

console.log(
  "CASA School Scanner PWA contract self-test passed.",
);