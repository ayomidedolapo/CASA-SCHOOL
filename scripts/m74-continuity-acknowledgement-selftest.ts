import {
  readFileSync,
} from "node:fs";

function source(
  path: string,
) {
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

const route =
  source(
    "src/app/api/terminal/continuity/sync/route.ts",
  );
const scanner =
  source(
    "src/app/scanner/scanner-client.tsx",
  );
const health =
  source(
    "src/app/api/health/route.ts",
  );

const afterStart =
  route.indexOf(
    "    after(",
  );
const responseStart =
  route.indexOf(
    "  return NextResponse.json(",
    afterStart,
  );
const afterBlock =
  afterStart >= 0 &&
  responseStart >
    afterStart
    ? route.slice(
        afterStart,
        responseStart,
      )
    : "";

expect(
  route.includes(
    "  after,",
  ) &&
  afterBlock.includes(
    "await runGuardianPushOutboxForPresenceEvent({",
  ) &&
  afterBlock.includes(
    "The durable outbox and scheduled worker remain authoritative.",
  ),
  "Continuity acknowledgement still blocks on guardian push delivery.",
);

expect(
  !route.includes(
    "  const guardianPushDelivery = [];",
  ) &&
  route.includes(
    "guardianPushDelivery:\n        []",
  ) &&
  route.includes(
    "guardianPushDeliveryDeferred:\n        hasRecordedResult",
  ),
  "Continuity response compatibility or deferred-delivery marker is incomplete.",
);

const syncEndpoint =
  scanner.indexOf(
    '"/api/terminal/continuity/sync"',
  );
const syncTail =
  syncEndpoint >= 0
    ? scanner.slice(
        syncEndpoint,
        syncEndpoint +
          5000,
      )
    : "";

const syncCallStart =
  scanner.lastIndexOf(
    "await terminalFetchWithRetry(",
    syncEndpoint,
  );
const syncCallEnd =
  scanner.indexOf(
    "\n              );",
    syncEndpoint,
  );
const syncCall =
  syncCallStart >= 0 &&
  syncCallEnd >
    syncCallStart
    ? scanner.slice(
        syncCallStart,
        syncCallEnd +
          "\n              );"
            .length,
      )
    : "";

expect(
  syncEndpoint >= 0 &&
  syncCallStart >= 0 &&
  syncCall.includes(
    '"/api/terminal/continuity/sync"',
  ) &&
  syncCall.includes(
    "\n                15_000,",
  ),
  "Continuity sync call does not use the required 15-second client timeout.",
);

expect(
  scanner.includes(
    "pending sync - retrying automatically",
  ) &&
  scanner.includes(
    "aria-busy={\n                continuitySyncing",
  ) &&
  !scanner.includes(
    "pending sync - syncing",
  ),
  "Pending continuity status still flashes between labels.",
);

expect(
  health.includes(
    '"X-CASA-Release-Revision":\n    "M73"',
  ) &&
  health.includes(
    '"X-CASA-Continuity-Sync-Revision":\n    "M74"',
  ),
  "M74 live continuity marker is missing or M73 baseline marker regressed.",
);

console.log(
  "M74 CONTINUITY ACKNOWLEDGEMENT CLOSURE SELFTEST = GREEN",
);
