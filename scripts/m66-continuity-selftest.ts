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
  "Continuity reconciliation must truthfully mark biometrics unavailable.",
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
  syncRoute.includes(
    "runGuardianPushOutbox",
  ),
  "Guardian push delivery is not resumed after continuity sync.",
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

console.log(
  "M66 OFFLINE CONTINUITY SELFTEST = GREEN",
);
