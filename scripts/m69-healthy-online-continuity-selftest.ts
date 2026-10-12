import { readFileSync } from "node:fs";

import {
  resolveContinuityMovementIntent,
} from "../src/server/attendance/continuity-movement-intent";

function source(path: string) {
  return readFileSync(
    path,
    "utf8",
  ).replace(
    /\r\n/g,
    "\n",
  );
}

function expect(
  value: unknown,
  message: string,
) {
  if (!value) {
    throw new Error(
      message,
    );
  }
}

const scanner =
  source(
    "src/app/scanner/scanner-client.tsx",
  );
const route =
  source(
    "src/app/api/terminal/continuity/sync/route.ts",
  );
const storage =
  source(
    "src/scanner/continuity-storage.ts",
  );
const sync =
  source(
    "src/server/attendance/continuity-sync.ts",
  );

const modeStart =
  scanner.indexOf(
    "const continuityModeActive",
  );
const modeEnd =
  scanner.indexOf(
    "const processContinuityCard",
    modeStart,
  );
const modeBlock =
  scanner.slice(
    modeStart,
    modeEnd,
  );

expect(
  modeStart >= 0 &&
    modeBlock.includes(
      '"DEGRADED"',
    ) &&
    modeBlock.includes(
      '"OFFLINE"',
    ) &&
    modeBlock.includes(
      '"RECOVERING"',
    ) &&
    !modeBlock.includes(
      "continuityPending",
    ),
  "Healthy Scanner mode must not be forced into continuity by pending queue depth.",
);

expect(
  scanner.includes(
    '"/api/terminal/continuity/sync"',
  ) &&
    scanner.includes(
      "await terminalFetchWithRetry(",
    ) &&
    scanner.includes(
      "5_000",
    ),
  "Continuity background sync must be bounded and back off instead of appearing permanently stuck.",
);

expect(
  route.includes(
    "movement:",
  ) &&
    route.includes(
      '"TEMPORARY_EXIT"',
    ) &&
    route.includes(
      '"TEMPORARY_RETURN"',
    ) &&
    route.includes(
      ".nullable()",
    ) &&
    route.includes(
      ".optional()",
    ),
  "Continuity sync route must preserve movement intent, including legacy absence.",
);

expect(
  storage.includes(
    "TEMPORARY_RETURN_REQUIRES_FRESH_SCAN",
  ) &&
    storage.includes(
      'movement:',
    ),
  "Legacy rejected return recovery must upgrade the durable event with return intent.",
);

expect(
  sync.includes(
    "resolveContinuityMovementIntent",
  ) &&
    sync.includes(
      "cycle.created_at",
    ) &&
    sync.includes(
      "input.movement",
    ),
  "Server continuity reconciliation must use captured movement intent and legacy timestamp guards.",
);

const authTime =
  new Date(
    "2026-10-12T08:00:00.000Z",
  );
const stepOutTime =
  new Date(
    "2026-10-12T08:10:00.000Z",
  );

const staleLegacyCheckIn =
  resolveContinuityMovementIntent({
    requestedMovement:
      undefined,
    operation:
      "CHECK_IN",
    capturedAt:
      new Date(
        "2026-10-12T07:55:00.000Z",
      ),
    cycleStatus:
      "AUTHORIZED",
    cycleCreatedAt:
      authTime,
    steppedOutAt:
      null,
  });

expect(
  staleLegacyCheckIn.ok &&
    staleLegacyCheckIn.movement ===
      null &&
    staleLegacyCheckIn.effectiveOperation ===
      "CHECK_IN",
  "A pre-authorization legacy check-in must remain a check-in.",
);

const explicitOrdinary =
  resolveContinuityMovementIntent({
    requestedMovement:
      null,
    operation:
      "CHECK_OUT",
    capturedAt:
      new Date(
        "2026-10-12T08:15:00.000Z",
      ),
    cycleStatus:
      "AUTHORIZED",
    cycleCreatedAt:
      authTime,
    steppedOutAt:
      null,
  });

expect(
  explicitOrdinary.ok &&
    explicitOrdinary.movement ===
      null &&
    explicitOrdinary.effectiveOperation ===
      "CHECK_OUT",
  "An explicit ordinary queued event must never be rewritten by a later movement cycle.",
);

const explicitExit =
  resolveContinuityMovementIntent({
    requestedMovement:
      "TEMPORARY_EXIT",
    operation:
      "CHECK_OUT",
    capturedAt:
      stepOutTime,
    cycleStatus:
      "AUTHORIZED",
    cycleCreatedAt:
      authTime,
    steppedOutAt:
      null,
  });

expect(
  explicitExit.ok &&
    explicitExit.movement ===
      "TEMPORARY_EXIT",
  "An M68+ queued temporary exit must preserve its explicit intent.",
);

const legacyExit =
  resolveContinuityMovementIntent({
    requestedMovement:
      undefined,
    operation:
      "CHECK_OUT",
    capturedAt:
      stepOutTime,
    cycleStatus:
      "AUTHORIZED",
    cycleCreatedAt:
      authTime,
    steppedOutAt:
      null,
  });

expect(
  legacyExit.ok &&
    legacyExit.movement ===
      "TEMPORARY_EXIT" &&
    legacyExit.legacyInferred,
  "A provable pre-M68 legacy temporary exit must remain recoverable.",
);

const explicitReturn =
  resolveContinuityMovementIntent({
    requestedMovement:
      "TEMPORARY_RETURN",
    operation:
      "CHECK_IN",
    capturedAt:
      new Date(
        "2026-10-12T08:20:00.000Z",
      ),
    cycleStatus:
      "OUTSIDE",
    cycleCreatedAt:
      authTime,
    steppedOutAt:
      stepOutTime,
  });

expect(
  explicitReturn.ok &&
    explicitReturn.movement ===
      "TEMPORARY_RETURN",
  "A queued temporary return must reconcile from its original intent.",
);

const badReturnOrder =
  resolveContinuityMovementIntent({
    requestedMovement:
      "TEMPORARY_RETURN",
    operation:
      "CHECK_IN",
    capturedAt:
      new Date(
        "2026-10-12T08:05:00.000Z",
      ),
    cycleStatus:
      "OUTSIDE",
    cycleCreatedAt:
      authTime,
    steppedOutAt:
      stepOutTime,
  });

expect(
  !badReturnOrder.ok &&
    badReturnOrder.code ===
      "CONTINUITY_TEMPORARY_RETURN_ORDER_INVALID",
  "Return ordering protection must remain enforced.",
);

console.log(
  "M69 HEALTHY ONLINE + CONTINUITY INTENT ISOLATION SELFTEST = GREEN",
);
