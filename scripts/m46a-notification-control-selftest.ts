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

function requireText(
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

function rejectText(
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

const layout =
  read(
    "src/app/layout.tsx",
  );

requireText(
  layout,
  "CasaInAppNotificationStack",
  "global notification stack mount",
);

const stack =
  read(
    "src/app/casa-in-app-notification-stack.tsx",
  );

for (
  const marker of [
    "more notification",
    "Collapse",
    "Hide notification from floating view",
    "notificationId",
    "20_000",
    "View details",
  ]
) {
  requireText(
    stack,
    marker,
    "floating notification stack",
  );
}

const internalPage =
  read(
    "src/app/internal/notifications/page.tsx",
  );

const schoolPage =
  read(
    "src/app/schools/[slug]/notifications/notifications-client.tsx",
  );

for (
  const source of [
    internalPage,
    schoolPage,
  ]
) {
  requireText(
    source,
    "Today",
    "notification date grouping",
  );
  requireText(
    source,
    "Yesterday",
    "notification date grouping",
  );
  requireText(
    source,
    "View details",
    "notification context navigation",
  );
  requireText(
    source,
    "Mark read",
    "notification dismissal",
  );
}

const schoolActivity =
  read(
    "src/server/notifications/school-activity.ts",
  );

for (
  const marker of [
    "listSchoolAuditEvents",
    "sourceAuditEventId",
    "7 *",
    "SCHOOL_OPERATOR",
  ]
) {
  requireText(
    schoolActivity,
    marker,
    "school notification reconciliation",
  );
}

const operational =
  read(
    "src/server/internal/operational-notifications.ts",
  );

for (
  const marker of [
    "SCHOOL_ACTIVITY",
    "SCHOOL_OPERATIONS",
    "604800",
  ]
) {
  requireText(
    operational,
    marker,
    "CASA internal school activity catalog",
  );
}

const reconcile =
  read(
    "src/server/internal/operational-reconcile.ts",
  );

for (
  const marker of [
    "student-registered:",
    "attendance-open:",
    "attendance-close:",
    "biometric:",
    "progression:",
    "card-lifecycle:",
    "schoolActivities",
  ]
) {
  requireText(
    reconcile,
    marker,
    "CASA internal activity reconciliation",
  );
}

const guardian =
  read(
    "src/server/messaging/guardian-presence-push.ts",
  );

for (
  const marker of [
    "has gotten to school at",
    "has left school at",
    "has left school early at",
    "school_timezone",
    "icon_url =",
    "excluded.icon_url",
    "presence_event_id is not null",
  ]
) {
  requireText(
    guardian,
    marker,
    "guardian natural attendance notification",
  );
}

rejectText(
  guardian,
  "' checked in.'",
  "old guardian check-in copy",
);

console.log(
  "CASA M46A notification control + guardian copy self-test passed.",
);
