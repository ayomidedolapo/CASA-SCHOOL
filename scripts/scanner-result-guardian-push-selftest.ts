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
  if (
    !source.includes(
      needle,
    )
  ) {
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
  if (
    source.includes(
      needle,
    )
  ) {
    throw new Error(
      `${label}: still contains ${needle}`,
    );
  }
}

const pushHelper =
  read(
    "src/server/messaging/guardian-presence-push.ts",
  );

for (
  const marker of [
    "guardian_push_outbox",
    "guardian_push_devices",
    "device.student_guardian_link_id =",
    "relationship.receives_notifications =",
    "device.status =",
    "on conflict (",
    "do update set",
    "excluded.icon_url",
    "presence_event_id is not null",
    "queueGuardianPresencePushBestEffort",
    "presenceEventId?: string",
    "notification-logo",
  ]
) {
  requireText(
    pushHelper,
    marker,
    "guardian attendance push queue",
  );
}

const standardFinalize =
  read(
    "src/server/attendance/finalize-presence.ts",
  );

requireText(
  standardFinalize,
  "guardianPushQueued",
  "standard presence push result",
);
requireText(
  standardFinalize,
  "queueGuardianPresencePushBestEffort",
  "standard presence push queue",
);

const earlyFinalize =
  read(
    "src/server/attendance/finalize-early-departure.ts",
  );

requireText(
  earlyFinalize,
  "STUDENT_EARLY_DEPARTURE",
  "early departure push event",
);
requireText(
  earlyFinalize,
  "guardianPushQueued",
  "early departure push result",
);

const pushWorker =
  read(
    "src/server/messaging/guardian-push-worker.ts",
  );

requireText(
  pushWorker,
  "schoolId?: string",
  "school-scoped push worker",
);
requireText(
  pushWorker,
  "schoolFilter",
  "school-scoped push filter",
);
requireText(
  pushWorker,
  "presenceEventId?: string",
  "current-event push worker scope",
);
requireText(
  pushWorker,
  "presenceEventFilter",
  "current-event due-row filter",
);
requireText(
  pushWorker,
  "device.status =",
  "active push-device guard",
);
requireText(
  pushWorker,
  "absolutePublicUrl",
  "notification icon URL normalization",
);
requireText(
  pushWorker,
  "notification-logo",
  "school notification logo fallback",
);

const completionRoute =
  read(
    "src/app/api/terminal/attempts/[attemptId]/biometric/liveness/complete/route.ts",
  );

rejectText(
  completionRoute,
  "after(",
  "push dispatch must complete before scanner result",
);
requireText(
  completionRoute,
  "runGuardianPushOutbox",
  "guardian push worker dispatch",
);
requireText(
  completionRoute,
  "presenceEventId:",
  "scan-triggered push targets current presence event",
);
requireText(
  completionRoute,
  "result.presence",
  "scan-triggered push uses finalized presence identity",
);
requireText(
  completionRoute,
  "guardianPushDelivery",
  "scanner response includes actual push delivery outcome",
);
requireText(
  completionRoute,
  "verificationImageDataUrl",
  "verification image response",
);

const awsLiveness =
  read(
    "src/server/biometrics/aws-liveness.ts",
  );

requireText(
  awsLiveness,
  "verificationImageDataUrl",
  "verification image encoder",
);
requireText(
  awsLiveness,
  "liveness.referenceImage",
  "verified liveness image source",
);

const contracts =
  read(
    "src/scanner/contracts.ts",
  );

requireText(
  contracts,
  "guardianPushQueued:",
  "scanner guardian push count",
);
requireText(
  contracts,
  "guardianPushDelivery:",
  "scanner push delivery contract",
);
requireText(
  contracts,
  "verificationImageDataUrl:",
  "scanner verification image",
);
requireText(
  contracts,
  "schoolName?: string;",
  "scanner school detail",
);

const scanner =
  read(
    "src/app/scanner/scanner-client.tsx",
  );

for (
  const marker of [
    "styles.resultFade",
    "styles.resultList",
    "styles.verificationPhoto",
    "Guardian alert",
    "guardianPushQueued",
    "finalResult",
    ".result",
    "verificationImageDataUrl",
    "6500",
  ]
) {
  requireText(
    scanner,
    marker,
    "scanner result brief",
  );
}

rejectText(
  scanner,
  ".filter(Boolean).join(\" · \")",
  "final compact detail presentation",
);
rejectText(
  scanner,
  "Cancel face check",
  "student liveness cancel control",
);
requireText(
  scanner,
  "guardianPushDelivery",
  "scanner delivery-result presentation",
);
requireText(
  scanner,
  "2026-09-24-r5",
  "scanner M45 UI revision",
);

const scannerCss =
  read(
    "src/app/scanner/scanner.module.css",
  );

for (
  const marker of [
    ".resultSummary",
    ".resultList",
    ".resultRow",
    ".verificationPhoto",
    ".resultFade",
    "@keyframes casaResultFade",
    "amplify-liveness-cancel-button",
  ]
) {
  requireText(
    scannerCss,
    marker,
    "scanner result presentation",
  );
}

const globalReceiver =
  read(
    "src/app/casa-foreground-notifications.tsx",
  );

for (
  const marker of [
    "onMessage",
    "showNotification",
    "casaIconUrl",
    "casaClickUrl",
    "Notification.permission",
  ]
) {
  requireText(
    globalReceiver,
    marker,
    "global foreground guardian push receiver",
  );
}

const rootLayout =
  read(
    "src/app/layout.tsx",
  );

requireText(
  rootLayout,
  "CasaForegroundNotifications",
  "global foreground receiver mount",
);

const firebaseSender =
  read(
    "src/server/messaging/firebase-fcm.ts",
  );

for (
  const marker of [
    "casaTitle",
    "casaBody",
    "casaIconUrl",
    "casaClickUrl",
  ]
) {
  requireText(
    firebaseSender,
    marker,
    "FCM display metadata",
  );
}

const messagingWorker =
  read(
    "src/app/firebase-messaging-sw.js/route.ts",
  );

for (
  const marker of [
    "data.casaTitle",
    "data.casaBody",
    "data.casaIconUrl",
    "data.casaClickUrl",
  ]
) {
  requireText(
    messagingWorker,
    marker,
    "background guardian push rendering",
  );
}

console.log(
  "CASA scanner result + guardian push self-test passed.",
);
