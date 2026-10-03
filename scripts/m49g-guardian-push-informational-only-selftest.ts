import fs from "node:fs";

function read(
  path: string,
) {
  return fs
    .readFileSync(
      path,
      "utf8",
    )
    .replace(
      /\r\n/g,
      "\n",
    );
}

function need(
  source: string,
  marker: string,
  label: string,
) {
  if (
    !source.includes(
      marker,
    )
  ) {
    throw new Error(
      `${label}: missing ${marker}`,
    );
  }
}

function forbid(
  source: string,
  marker: string,
  label: string,
) {
  if (
    source.includes(
      marker,
    )
  ) {
    throw new Error(
      `${label}: still contains ${marker}`,
    );
  }
}

const guardian =
  read(
    "src/app/guardian-notifications/[token]/guardian-notification-client.tsx",
  );

for (
  const marker of [
    "NotificationDiagnostics",
    "setDiagnostics",
    "Notification diagnostics",
    "Firebase worker",
    "Installation ID received",
    "CASA device save",
  ]
) {
  forbid(
    guardian,
    marker,
    "retired guardian diagnostic UI",
  );
}

for (
  const marker of [
    "casaClickUrl",
    "const clickUrl",
    "data: {\n                  url:",
  ]
) {
  forbid(
    guardian,
    marker,
    "guardian foreground push must be informational only",
  );
}

need(
  guardian,
  '"/firebase-messaging-sw.js"',
  "guardian Firebase worker registration",
);

const globalForeground =
  read(
    "src/app/casa-foreground-notifications.tsx",
  );

for (
  const marker of [
    "casaClickUrl",
    "const clickUrl",
    "data: {\n                      url:",
  ]
) {
  forbid(
    globalForeground,
    marker,
    "global foreground push must be informational only",
  );
}

need(
  globalForeground,
  "showNotification",
  "global foreground push rendering",
);

const sender =
  read(
    "src/server/messaging/firebase-fcm.ts",
  );

for (
  const marker of [
    "clickUrl",
    "casaClickUrl",
    "fcm_options",
  ]
) {
  forbid(
    sender,
    marker,
    "FCM sender must not attach guardian navigation metadata",
  );
}

for (
  const marker of [
    "casaTitle",
    "casaBody",
    "casaIconUrl",
  ]
) {
  need(
    sender,
    marker,
    "FCM display metadata",
  );
}

const pushWorker =
  read(
    "src/server/messaging/guardian-push-worker.ts",
  );

forbid(
  pushWorker,
  "clickUrl:",
  "guardian push delivery must not pass navigation target",
);

need(
  pushWorker,
  "sendFcmToFid",
  "guardian push delivery",
);

const workerRoute =
  read(
    "src/app/firebase-messaging-sw.js/route.ts",
  );

for (
  const marker of [
    "clients.openWindow",
    "casaClickUrl",
    "fcmOptions.link",
    "data: {\n        url:",
  ]
) {
  forbid(
    workerRoute,
    marker,
    "background push click navigation",
  );
}

for (
  const marker of [
    'self.addEventListener("notificationclick"',
    "event.preventDefault();",
    "event.stopImmediatePropagation();",
    "event.notification.close();",
    "showNotification",
  ]
) {
  need(
    workerRoute,
    marker,
    "background informational push handling",
  );
}

const activationRoute =
  read(
    "src/app/api/guardian-notifications/[token]/route.ts",
  );

for (
  const marker of [
    "clickUrl:",
    "casaClickUrl",
  ]
) {
  forbid(
    activationRoute,
    marker,
    "guardian activation test push navigation",
  );
}

need(
  activationRoute,
  "CASA notifications are enabled for",
  "guardian activation test push",
);

const clickHandlerIndex =
  workerRoute.indexOf(
    'self.addEventListener("notificationclick"',
  );
const firebaseImportIndex =
  workerRoute.indexOf(
    'importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js")',
  );

if (
  clickHandlerIndex < 0 ||
  firebaseImportIndex < 0 ||
  clickHandlerIndex >
    firebaseImportIndex
) {
  throw new Error(
    "CASA notificationclick blocker must register before Firebase compat scripts.",
  );
}

if (
  fs.existsSync(
    "scripts/m49f-guardian-notification-diagnostics-selftest.ts",
  )
) {
  throw new Error(
    "Temporary M49F diagnostic self-test must be removed.",
  );
}

console.log(
  "CASA M49G guardian push informational-only self-test passed.",
);
