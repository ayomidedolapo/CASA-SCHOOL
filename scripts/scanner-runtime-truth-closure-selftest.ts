import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relative: string) {
  return fs
    .readFileSync(
      path.join(
        root,
        relative,
      ),
      "utf8",
    )
    .replace(
      /\r\n/g,
      "\n",
    );
}

function requireText(
  source: string,
  needle: string,
  label: string,
) {
  if (!source.includes(needle)) {
    throw new Error(
      `${label}: missing ${needle}`,
    );
  }
}

function rejectText(
  source: string,
  needle: string,
  label: string,
) {
  if (source.includes(needle)) {
    throw new Error(
      `${label}: still contains ${needle}`,
    );
  }
}

const nextConfig =
  read("next.config.ts");
requireText(
  nextConfig,
  'source: "/scanner"',
  "scanner cache-control",
);
requireText(
  nextConfig,
  "no-store, no-cache, must-revalidate",
  "scanner cache-control",
);

const scannerPage =
  read(
    "src/app/scanner/page.tsx",
  );
requireText(
  scannerPage,
  'dynamic =\n  "force-dynamic"',
  "scanner dynamic route",
);
requireText(
  scannerPage,
  "revalidate = 0",
  "scanner dynamic route",
);

const scanner =
  read(
    "src/app/scanner/scanner-client.tsx",
  );
for (
  const marker of [
    "SCANNER_UI_REVISION",
    'updateViaCache:\n                "none"',
    "isEarlyDepartureRetry",
    "Waiting for staff authorization",
    "verificationImageDataUrl",
    "resultList",
  ]
) {
  requireText(
    scanner,
    marker,
    "scanner runtime truth",
  );
}
requireText(
  scanner,
  "!isEarlyDepartureRetry",
  "early-departure Next-student suppression",
);

const css =
  read(
    "src/app/scanner/scanner.module.css",
  );
requireText(
  css,
  ".resultSummary {\n  display: block;",
  "single-column scanner result summary",
);
requireText(
  css,
  ".resultRow {\n  display: block;",
  "vertical scanner result list",
);
requireText(
  css,
  ".revision",
  "scanner revision marker",
);

const liveness =
  read(
    "src/server/biometrics/aws-liveness.ts",
  );
requireText(
  liveness,
  'from "sharp"',
  "verification image compression",
);
requireText(
  liveness,
  "await verificationImageDataUrl",
  "verification image compression",
);

const earlyService =
  read(
    "src/server/attendance/early-departure.ts",
  );
requireText(
  earlyService,
  "cancelEarlyDeparture",
  "early-departure cancellation",
);
requireText(
  earlyService,
  "EARLY_DEPARTURE_CANCELLED_BY_STAFF",
  "early-departure cancellation",
);
requireText(
  earlyService,
  "biometric_liveness_sessions",
  "early-departure liveness cancellation",
);

const earlyRoute =
  read(
    "src/app/api/schools/[slug]/attendance/early-departures/[attemptId]/authorize/route.ts",
  );
requireText(
  earlyRoute,
  "export async function DELETE",
  "early-departure cancel API",
);

const attendanceClient =
  read(
    "src/app/schools/[slug]/attendance/attendance-client.tsx",
  );
requireText(
  attendanceClient,
  "cancelEarlyDepartureRequest",
  "early-departure cancel UI",
);
requireText(
  attendanceClient,
  "Cancel request with Passkey",
  "early-departure cancel UI",
);
requireText(
  attendanceClient,
  "waiting for guardian push reconciliation",
  "guardian warning truth",
);

const presencePush =
  read(
    "src/server/messaging/guardian-presence-push.ts",
  );
requireText(
  presencePush,
  "reconcileRecentGuardianPresencePushes",
  "guardian push reconciliation",
);
requireText(
  presencePush,
  "interval '1 minute'",
  "guardian push reconciliation",
);

const worker =
  read(
    "src/server/messaging/guardian-push-worker.ts",
  );
requireText(
  worker,
  "reconciled",
  "guardian push worker reconciliation",
);

const completion =
  read(
    "src/app/api/terminal/attempts/[attemptId]/biometric/liveness/complete/route.ts",
  );
rejectText(
  completion,
  "guardianPushQueued >",
  "unconditional post-attendance reconciliation",
);
requireText(
  completion,
  "runGuardianPushOutbox",
  "post-attendance guardian delivery",
);

const today =
  read(
    "src/server/attendance/today.ts",
  );
requireText(
  today,
  "interval '2 hours'",
  "recent guardian warning window",
);
if (
  !/relationship\.receives_notifications\s*=\s*true/.test(
    today,
  )
) {
  throw new Error(
    "guardian warning recipient truth: receives_notifications=true relationship filter is missing",
  );
}
rejectText(
  today,
  "school_notification_outbox",
  "guardian warning must not treat legacy outbox as guardian push",
);

console.log(
  "CASA scanner runtime truth closure self-test passed.",
);
