import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

function requireText(
  source: string,
  needle: string,
  label: string,
) {
  if (!source.includes(needle)) {
    throw new Error(
      `M52 selftest failed: ${label}`,
    );
  }

  console.log(
    `GREEN: ${label}`,
  );
}

function forbidText(
  source: string,
  needle: string,
  label: string,
) {
  if (source.includes(needle)) {
    throw new Error(
      `M52 selftest failed: ${label}`,
    );
  }

  console.log(
    `GREEN: ${label}`,
  );
}

const notificationLogo =
  read(
    "src/app/api/public/schools/[schoolId]/notification-logo/route.ts",
  );
const fcm =
  read(
    "src/server/messaging/firebase-fcm.ts",
  );
const worker =
  read(
    "src/server/messaging/guardian-push-worker.ts",
  );
const serviceWorker =
  read(
    "src/app/firebase-messaging-sw.js/route.ts",
  );
const foreground =
  read(
    "src/app/casa-foreground-notifications.tsx",
  );
const keeper =
  read(
    "src/app/guardian-device-registration-keeper.tsx",
  );
const deviceRegistration =
  read(
    "src/app/api/guardian-notifications/device-registration/route.ts",
  );
const setupRoute =
  read(
    "src/app/api/guardian-notifications/[token]/route.ts",
  );
const attendanceClient =
  read(
    "src/app/schools/[slug]/attendance/attendance-client.tsx",
  );
const assistedCheckout =
  read(
    "src/server/attendance/assisted-checkout.ts",
  );

requireText(
  notificationLogo,
  "CASA_M52_ANDROID_NOTIFICATION_BRANDING",
  "Android notification branding closure marker PRESENT",
);
requireText(
  notificationLogo,
  '"badge"',
  "notification asset supports badge variant",
);
requireText(
  notificationLogo,
  ".resize(",
  "notification school logo is normalized before delivery",
);
requireText(
  notificationLogo,
  '"image/png"',
  "notification assets are emitted as PNG",
);

requireText(
  fcm,
  "badgeUrl?: string | null;",
  "FCM accepts a dedicated Android badge asset",
);
requireText(
  fcm,
  "casaBadgeUrl:",
  "FCM data carries dedicated badge URL",
);
requireText(
  fcm,
  "casaIconUrl:",
  "FCM data carries full school notification icon URL",
);
forbidText(
  fcm,
  "badge:\n                          input.iconUrl",
  "FCM no longer reuses the full school logo as Android badge",
);

requireText(
  worker,
  'variant:\n            "icon"',
  "guardian worker creates full school notification icon URL",
);
requireText(
  worker,
  'variant:\n            "badge"',
  "guardian worker creates Android-safe badge URL",
);
requireText(
  worker,
  "badgeUrl,",
  "guardian worker sends dedicated badge URL",
);

requireText(
  serviceWorker,
  "data.casaBadgeUrl",
  "background service worker receives dedicated badge",
);
requireText(
  serviceWorker,
  "badge,",
  "background notification uses dedicated badge",
);
forbidText(
  serviceWorker,
  "badge: icon",
  "background notification no longer masks full school icon as badge",
);

requireText(
  foreground,
  "?.casaBadgeUrl",
  "foreground notification receives dedicated badge",
);
requireText(
  keeper,
  "badgeUrl?: unknown;",
  "catch-up notification accepts dedicated badge",
);
requireText(
  deviceRegistration,
  '"badge"',
  "catch-up API returns badge variant",
);
requireText(
  setupRoute,
  'notificationBadge.searchParams.set(\n    "variant",\n    "badge"',
  "notification setup test uses dedicated Android badge",
);

requireText(
  attendanceClient,
  'data?.session?.mode === "PRESENCE_ONLY"',
  "PRESENCE_ONLY attendance UI remains supported",
);
requireText(
  attendanceClient,
  '!student.scannerCheckoutEligible && (\n                                <button',
  "PRESENCE_ONLY no-card student gets Assisted sign-out action",
);
requireText(
  attendanceClient,
  'data?.session?.status === "CLOSED"',
  "PRESENCE_ONLY assisted sign-out remains available after session close",
);
requireText(
  assistedCheckout,
  'candidate.branch_mode !==\n        "PRESENCE_ONLY" &&\n      paymentStatus === "UNPAID"',
  "lost-card checkout skips instructional grace enforcement on PRESENCE_ONLY days",
);
requireText(
  assistedCheckout,
  '"CARD_REPLACEMENT_PAYMENT_REQUIRED"',
  "instructional lost-card grace enforcement remains intact",
);
requireText(
  assistedCheckout,
  'candidate.branch_mode ===\n        "PRESENCE_ONLY"',
  "PRESENCE_ONLY sign-out remains classified as normal departure",
);

console.log(
  "RESULT: M52 Android branding + PRESENCE_ONLY assisted sign-out selftest GREEN",
);
