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

const scanner =
  source(
    "src/app/scanner/scanner-client.tsx",
  );
const install =
  source(
    "src/app/scanner/scanner-install-control.tsx",
  );
const sync =
  source(
    "src/server/attendance/continuity-sync.ts",
  );
const health =
  source(
    "src/app/api/health/route.ts",
  );
const m70 =
  source(
    "scripts/m70-continuity-online-race-selftest.ts",
  );

expect(
  scanner.includes(
    '"2026-10-12-m73-continuity-heartbeat-pwa-bootstrap"',
  ),
  "M73 Scanner revision marker is missing.",
);

const helperStart =
  scanner.indexOf(
    "function continuityBackgroundSyncAllowed(",
  );
const helperEnd =
  scanner.indexOf(
    "interface LivenessState",
    helperStart,
  );
const helper =
  helperStart >= 0 &&
  helperEnd > helperStart
    ? scanner.slice(
        helperStart,
        helperEnd,
      )
    : "";

for (
  const phase of
    [
      "READY",
      "WAITING",
      "RESULT",
      "CONTINUITY_RESULT",
      "ERROR",
    ]
) {
  expect(
    helper.includes(
      `"${phase}"`,
    ),
    `Safe background-sync phase missing: ${phase}`,
  );
}

for (
  const phase of
    [
      "CARD",
      "LIVENESS",
      "FACE_RETRY",
      "STAFF",
      "LOCKED",
      "UNPROVISIONED",
    ]
) {
  expect(
    !helper.includes(
      `"${phase}"`,
    ),
    `Unsafe background-sync phase was enabled: ${phase}`,
  );
}

const syncStart =
  scanner.indexOf(
    "  const syncContinuityQueue =",
  );
const heartbeatStart =
  scanner.indexOf(
    "  useEffect(\n    () => {\n      if (\n        !token ||\n        continuityPending <=",
    syncStart,
  );
const heartbeatEnd =
  scanner.indexOf(
    "  useEffect(\n    () => {\n      if (\n        phase !==\n          \"LIVENESS\"",
    heartbeatStart,
  );
const syncBlock =
  syncStart >= 0 &&
  heartbeatStart > syncStart
    ? scanner.slice(
        syncStart,
        heartbeatStart,
      )
    : "";
const heartbeat =
  heartbeatStart >= 0 &&
  heartbeatEnd > heartbeatStart
    ? scanner.slice(
        heartbeatStart,
        heartbeatEnd,
      )
    : "";

expect(
  syncBlock.includes(
    "!continuityBackgroundSyncAllowed(",
  ) &&
  syncBlock.includes(
    "continuitySyncingRef",
  ) &&
  !syncBlock.includes(
    "continuitySyncing ||",
  ),
  "M73 synchronization serialization still depends on render-state timing.",
);

expect(
  heartbeat.includes(
    "triggerContinuitySync();",
  ) &&
  heartbeat.includes(
    "window.setInterval(",
  ) &&
  heartbeat.includes(
    "4_000",
  ) &&
  heartbeat.includes(
    '"online"',
  ) &&
  heartbeat.includes(
    '"focus"',
  ) &&
  heartbeat.includes(
    '"pageshow"',
  ) &&
  heartbeat.includes(
    '"visibilitychange"',
  ) &&
  !heartbeat.includes(
    "window.setTimeout(",
  ),
  "M73 durable continuity heartbeat is incomplete.",
);

expect(
  syncBlock.includes(
    'response.status ===\n                  400',
  ) &&
  syncBlock.includes(
    '"CONTINUITY_PAYLOAD_INVALID"',
  ) &&
  syncBlock.includes(
    "await rejectContinuityEvents([",
  ),
  "Malformed continuity payloads can still remain pending forever.",
);

const installBootstrapStart =
  install.indexOf(
    "      const displayMode =\n        window.matchMedia(",
  );
const installBootstrapEnd =
  install.indexOf(
    "      function capturePrompt(",
    installBootstrapStart,
  );
const installBootstrap =
  installBootstrapStart >= 0 &&
  installBootstrapEnd >
    installBootstrapStart
    ? install.slice(
        installBootstrapStart,
        installBootstrapEnd,
      )
    : "";

expect(
  install.includes(
    "useState<\n      boolean | null\n    >(\n      null,",
  ) &&
  install.includes(
    "installed !==\n      false",
  ) &&
  installBootstrap.includes(
    "const frame =\n        window.requestAnimationFrame(",
  ) &&
  installBootstrap.includes(
    "setInstalled(\n              isStandalone(),\n            );",
  ) &&
  install.includes(
    "window.cancelAnimationFrame(\n          frame,\n        );",
  ),
  "Installed Scanner bootstrap can render before standalone state resolves or lacks animation-frame cleanup.",
);

const postRecordStart =
  sync.indexOf(
    "  let notificationQueued =",
  );
const postRecord =
  postRecordStart >= 0
    ? sync.slice(
        postRecordStart,
      )
    : "";

expect(
  postRecord.includes(
    "Recorded attendance must be acknowledged even if school notification queueing fails.",
  ) &&
  postRecord.includes(
    "Durable notification workers can catch up after attendance reconciliation succeeds.",
  ) &&
  postRecord.includes(
    "let guardianPushQueued =\n    0;",
  ),
  "Post-record notification failures can still prevent continuity acknowledgement.",
);

expect(
  health.includes(
    '"X-CASA-Release-Revision":\n    "M73"',
  ),
  "M73 live release marker is missing from health.",
);

expect(
  m70.includes(
    "durable M73 healthy heartbeat",
  ),
  "M70 protected proof was not migrated to the M73 heartbeat contract.",
);

console.log(
  "M73 CONTINUITY HEARTBEAT + PWA BOOTSTRAP SELFTEST = GREEN",
);
