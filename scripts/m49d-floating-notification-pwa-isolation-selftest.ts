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
  if (!source.includes(marker)) {
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
  if (source.includes(marker)) {
    throw new Error(
      `${label}: still contains ${marker}`,
    );
  }
}

const stack =
  read(
    "src/app/casa-in-app-notification-stack.tsx",
  );

for (
  const marker of [
    "touch-none cursor-grab select-none",
    "onPointerDown={",
    "startDrag",
    "suppressClickRef",
    'data-floating-close="true"',
    'aria-label="Close floating notifications"',
    "hideAllFloating();",
    "index ===",
  ]
) {
  need(
    stack,
    marker,
    "floating notification mobile drag/close UX",
  );
}

for (
  const marker of [
    'aria-label="Drag notifications"',
    ">Drag<",
    ">Hide all<",
    'aria-label="Hide notification from floating view"',
    "hideNotification(",
  ]
) {
  forbid(
    stack,
    marker,
    "retired floating notification control",
  );
}

const foreground =
  read(
    "src/app/casa-foreground-notifications.tsx",
  );

for (
  const marker of [
    "usePathname",
    'pathname ===\n          "/scanner"',
    'pathname.startsWith(\n          "/guardian-notifications/"',
  ]
) {
  need(
    foreground,
    marker,
    "global Firebase context isolation",
  );
}

const scanner =
  read(
    "src/app/scanner/scanner-client.tsx",
  );

for (
  const marker of [
    "getRegistrations",
    'scriptPath ===\n                "/scanner-sw.js"',
    'scopePath !==\n                "/scanner"',
    ".unregister()",
    'scope:\n                    "/scanner"',
  ]
) {
  need(
    scanner,
    marker,
    "scanner service-worker scope hardening",
  );
}

const guardian =
  read(
    "src/app/guardian-notifications/[token]/guardian-notification-client.tsx",
  );

for (
  const marker of [
    "removeBroadScannerServiceWorkers",
    "getRegistrations",
    '"/scanner-sw.js"',
    ".unregister()",
    "await removeBroadScannerServiceWorkers();",
    "Notification.permission",
    ".requestPermission()",
    '"/firebase-messaging-sw.js"',
  ]
) {
  need(
    guardian,
    marker,
    "guardian notification permission isolation",
  );
}

console.log(
  "CASA M49D floating notification + PWA isolation self-test passed.",
);
