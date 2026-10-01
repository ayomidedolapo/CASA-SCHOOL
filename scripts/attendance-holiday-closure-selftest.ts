import assert from "node:assert/strict";
import fs from "node:fs";

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

const assisted = read(
  "src/server/attendance/assisted-checkout.ts",
);
const assistedRoute = read(
  "src/app/api/schools/[slug]/attendance/assisted-checkouts/[studentId]/route.ts",
);
const calendarClosure = read(
  "src/server/school-operations/calendar-closure.ts",
);
const calendarPush = read(
  "src/server/messaging/guardian-calendar-push.ts",
);
const guardianWorker = read(
  "src/server/messaging/guardian-push-worker.ts",
);
const calendarCreateRoute = read(
  "src/app/api/schools/[slug]/calendar-events/route.ts",
);
const calendarUpdateRoute = read(
  "src/app/api/schools/[slug]/calendar-events/[eventId]/route.ts",
);
const statusRoute = read(
  "src/app/api/schools/[slug]/calendar-status/route.ts",
);
const notice = read(
  "src/app/schools/[slug]/school-calendar-notice.tsx",
);
const layout = read(
  "src/app/schools/[slug]/layout.tsx",
);
const attendanceClient = read(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
);
const branchSession = read(
  "src/server/attendance/branch-session.ts",
);
const lateStay = read(
  "src/server/attendance/late-stay.ts",
);

assert.match(
  assisted,
  /ASSISTED_CHECKOUT_CLEANUP_BEST_EFFORT/,
);
assert.match(
  assisted,
  /ASSISTED_CHECKOUT_MESSAGING_BEST_EFFORT/,
);
assert.match(
  assisted,
  /on conflict\s*\(\s*school_id,\s*attendance_record_id,\s*event_type\s*\)/,
);
assert.match(
  assisted,
  /CALENDAR_CLOSURE_ACTIVE/,
);
assert.match(
  assistedRoute,
  /ASSISTED_CHECKOUT_INTERNAL_ERROR/,
);

for (
  const marker of [
    "getActiveCalendarClosure",
    "getCurrentCalendarClosure",
    "assertCalendarEventCanActivate",
    "nextInstructionalDate",
    "durationDays",
  ]
) {
  assert.ok(
    calendarClosure.includes(marker),
    `calendar closure helper missing ${marker}`,
  );
}

for (
  const marker of [
    "SCHOOL_CALENDAR_NOTICE",
    "calendarEventRevision",
    "reconcileDueGuardianCalendarPushes",
    "receives_notifications",
    "firebase_installation_id",
  ]
) {
  assert.ok(
    calendarPush.includes(marker),
    `guardian calendar push missing ${marker}`,
  );
}

assert.match(
  guardianWorker,
  /reconcileDueGuardianCalendarPushes/,
);
assert.match(
  guardianWorker,
  /relationship\.receives_notifications[\s\S]*true/,
);
assert.match(
  guardianWorker,
  /calendarEventFilter/,
);

assert.match(
  calendarCreateRoute,
  /assertCalendarEventCanActivate/,
);
assert.match(
  calendarCreateRoute,
  /syncGuardianCalendarEventPushes/,
);
assert.match(
  calendarUpdateRoute,
  /assertCalendarEventCanActivate/,
);
assert.match(
  calendarUpdateRoute,
  /syncGuardianCalendarEventPushes/,
);

assert.match(
  statusRoute,
  /calendar-status|CALENDAR_BRANCH_ACCESS_DENIED/,
);
assert.match(
  notice,
  /backdrop[\s\S]*Attendance operations are unavailable during this closure/,
);
assert.match(
  notice,
  /casa:calendar-branch-context/,
);
assert.match(
  layout,
  /SchoolCalendarNotice/,
);
assert.match(
  attendanceClient,
  /casa:calendar-branch-context/,
);

for (
  const marker of [
    "CALENDAR_CLOSURE_ACTIVE",
    "calendarClosure",
    "calendarClosureMessage",
  ]
) {
  assert.ok(
    branchSession.includes(marker),
    `branch attendance closure authority missing ${marker}`,
  );
}

assert.match(
  lateStay,
  /CALENDAR_CLOSURE_ACTIVE/,
);

console.log(
  "CASA assisted sign-out + calendar closure source self-test passed.",
);
