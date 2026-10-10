import {
  readFileSync,
} from "node:fs";

function source(
  path: string,
) {
  return readFileSync(
    path,
    "utf8",
  );
}

function expect(
  condition: unknown,
  message: string,
) {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

const scanner =
  source(
    "src/app/scanner/scanner-client.tsx",
  );
const storage =
  source(
    "src/scanner/continuity-storage.ts",
  );
const card =
  source(
    "src/scanner/continuity-card.ts",
  );
const bootstrap =
  source(
    "src/app/api/terminal/continuity/bootstrap/route.ts",
  );
const syncRoute =
  source(
    "src/app/api/terminal/continuity/sync/route.ts",
  );
const sync =
  source(
    "src/server/attendance/continuity-sync.ts",
  );
const push =
  source(
    "src/server/messaging/guardian-presence-push.ts",
  );
const sms =
  source(
    "src/server/messaging/simhostng-provider.ts",
  );
const worker =
  source(
    "public/scanner-sw.js",
  );

expect(
  scanner.includes(
    "Continuity ready",
  ) &&
  scanner.includes(
    "pending sync",
  ),
  "Scanner does not expose continuity readiness and pending sync.",
);

expect(
  scanner.includes(
    "processContinuityCard",
  ) &&
  scanner.includes(
    "syncContinuityQueue",
  ),
  "Scanner continuity runtime is not wired.",
);

expect(
  scanner.includes(
    '"/api/terminal/continuity/bootstrap"',
  ) &&
  scanner.includes(
    '"/api/terminal/continuity/sync"',
  ),
  "Scanner continuity API routes are not wired.",
);

expect(
  scanner.includes(
    "continuityFallbackRef",
  ) &&
  scanner.includes(
    "handleLivenessTransportError",
  ),
  "Biometric transport fallback bridge is missing.",
);

expect(
  scanner.includes(
    'error.state ===\n            "CONNECTION_TIMEOUT"',
  ),
  "AWS websocket connection-timeout continuity fallback is missing.",
);

expect(
  !scanner.includes(
    'error.state ===\n            "SERVER_ERROR" ||',
  ) &&
  !scanner.includes(
    'error.state ===\n            "CAMERA_ACCESS_ERROR"',
  ) &&
  !scanner.includes(
    'error.state ===\n            "MULTIPLE_FACES_ERROR"',
  ),
  "Non-connectivity liveness failures must not silently bypass biometrics.",
);

expect(
  scanner.includes(
    '"AWS_BIOMETRIC_UNAVAILABLE"',
  ),
  "AWS biometric unavailable classification is missing.",
);

expect(
  scanner.includes(
    '1,\n              3000,\n            );\n\n          const data =\n            await parseJson<\n              ScannerLivenessStart',
  ),
  "AWS liveness start is not bounded to one 3000ms request.",
);

expect(
  scanner.includes(
    '1,\n              5000,\n            );\n\n          const data =\n            await parseJson<\n              ScannerPresenceResult',
  ),
  "AWS liveness completion is not bounded to one 5000ms request.",
);

expect(
  storage.includes(
    "casa-school-scanner-continuity",
  ) &&
  storage.includes(
    '"PENDING"',
  ) &&
  storage.includes(
    '"REJECTED"',
  ),
  "Durable continuity queue storage is incomplete.",
);

expect(
  storage.includes(
    ".clear()",
  ) &&
  !storage.includes(
    "deleteDatabase",
  ),
  "Continuity reset must clear stores deterministically.",
);

expect(
  card.includes(
    "crypto.subtle",
  ) &&
  card.includes(
    "EARLY_DEPARTURE_AUTH_REQUIRED",
  ),
  "Local card hashing or early-departure safety is missing.",
);

expect(
  bootstrap.includes(
    "token_hash",
  ) &&
  !bootstrap.includes(
    "qrPayload",
  ),
  "Continuity bootstrap must cache card hashes, not raw QR credentials.",
);

expect(
  sync.includes(
    "'UNAVAILABLE'::attendance_face_result",
  ) &&
  sync.includes(
    "'UNAVAILABLE'::attendance_liveness_result",
  ),
  "Continuity reconciliation must mark biometrics unavailable.",
);

expect(
  sync.includes(
    "${input.capturedAt}::timestamptz",
  ) &&
  sync.includes(
    "CONNECTIVITY_CONTINUITY_OFFLINE",
  ),
  "Continuity reconciliation does not preserve original scan time/provenance.",
);

expect(
  sync.includes(
    "CONTINUITY_EVENT_ORDER_INVALID",
  ),
  "Continuity event-order hardening is missing.",
);

expect(
  syncRoute.includes(
    "runGuardianPushOutbox",
  ),
  "Guardian push delivery is not resumed after continuity sync.",
);

expect(
  push.includes(
    "Notification delayed due to temporary connectivity loss.",
  ),
  "Guardian push does not disclose delayed connectivity delivery.",
);

expect(
  sms.includes(
    "Notification delayed due to temporary connectivity loss.",
  ),
  "Guardian SMS does not disclose delayed connectivity delivery.",
);

expect(
  worker.includes(
    "CASA_SCANNER_CACHE",
  ) &&
  worker.includes(
    'url.pathname.startsWith(\n        "/api/",',
  ),
  "Scanner service worker offline shell policy is missing or caches APIs.",
);

expect(
  !scanner.includes(
    "\u00c2",
  ) &&
  !scanner.includes(
    "\u00c3",
  ),
  "Scanner source contains mojibake characters.",
);

console.log(
  "M66 OFFLINE CONTINUITY CLOSURE SELFTEST = GREEN",
);
