import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function expect(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const migration = source(
  "drizzle/20261012150000_m76_guardian_closure_late_stay_truth/migration.sql",
);
const helper = source(
  "src/server/messaging/guardian-attendance-operations-push.ts",
);
const branchSession = source(
  "src/server/attendance/branch-session.ts",
);
const lateStay = source(
  "src/server/attendance/late-stay.ts",
);
const sessionRoute = source(
  "src/app/api/schools/[slug]/branches/[branchId]/attendance/sessions/today/route.ts",
);
const lateStayRoute = source(
  "src/app/api/schools/[slug]/branches/[branchId]/attendance/late-stay/route.ts",
);
const worker = source(
  "src/server/messaging/guardian-push-worker.ts",
);
const background = source(
  "src/app/firebase-messaging-sw.js/route.ts",
);
const foreground = source(
  "src/app/casa-foreground-notifications.tsx",
);
const attendanceUi = source(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
);
const operations = source(
  "src/server/school-operations/operations.ts",
);
const health = source(
  "src/app/api/health/route.ts",
);

expect(
  migration.includes(
    "operational_event_key varchar(240)",
  ) &&
    migration.includes(
      "guardian_push_outbox_operational_event_device_unique",
    ) &&
    migration.includes(
      "'SCHOOL_DAY_CLOSED'",
    ) &&
    migration.includes(
      "'STUDENT_LATE_STAY_AUTHORIZED'",
    ) &&
    migration.includes(
      "'SCHOOL_CALENDAR_NOTICE'",
    ) &&
    migration.includes(
      "'STUDENT_TEMPORARILY_OUT'",
    ),
  "M76 guardian outbox migration no longer preserves the operational event types/dedupe foundation.",
);

expect(
  helper.includes(
    "queueGuardianScheduledDismissalPushes",
  ) &&
    helper.includes(
      "SCHOOL_NORMAL_DISMISSAL:",
    ) &&
    helper.includes(
      "policy_day.normal_dismissal_at",
    ) &&
    helper.includes(
      "notificationKind",
    ) &&
    helper.includes(
      "NORMAL_DISMISSAL",
    ) &&
    helper.includes(
      "Regular school hours at ",
    ) &&
    helper.includes(
      "like 'SCHOOL_DAY_CLOSED:%'",
    ) &&
    helper.includes(
      "queueGuardianLateStayPushes",
    ) &&
    helper.includes(
      "reconcileRecentGuardianAttendanceOperationalPushes",
    ) &&
    helper.includes(
      "branch_map.branch_id =\n             dismissal.branch_id",
    ) &&
    helper.includes(
      "select distinct on (\n          relationship.guardian_id,\n          device.firebase_installation_id",
    ),
  "M76R1 scheduled dismissal guardian queue/reconciliation or branch isolation is incomplete.",
);

expect(
  !branchSession.includes(
    "queueGuardianBranchClosurePushes",
  ) &&
    !branchSession.includes(
      "guardianNotificationBatchKey",
    ) &&
    !branchSession.includes(
      "guardianNotificationQueued",
    ) &&
    branchSession.includes(
      "and bs.status = 'OPEN'",
    ) &&
    branchSession.includes(
      "set status = 'CLOSED'",
    ),
  "Manual attendance close still appears coupled to guardian-wide notification delivery.",
);

expect(
  !sessionRoute.includes(
    "runGuardianPushOutbox",
  ) &&
    !sessionRoute.includes(
      "guardianNotificationBatchKey",
    ) &&
    !sessionRoute.includes(
      "after,",
    ) &&
    lateStayRoute.includes(
      "after,",
    ) &&
    lateStayRoute.includes(
      "operationalBatchKey",
    ) &&
    lateStayRoute.includes(
      "runGuardianPushOutbox",
    ),
  "Manual close delivery was not removed cleanly or immediate late-stay delivery regressed.",
);

expect(
  lateStay.includes(
    "queueGuardianLateStayPushes",
  ) &&
    lateStay.includes(
      '["OPEN", "CLOSED"].includes(session.branch_status)',
    ) &&
    lateStay.includes(
      "recipient.reason",
    ) === false &&
    lateStay.includes(
      "guardianNotificationBatchKey",
    ) &&
    lateStay.includes(
      "guardianNotificationQueued",
    ),
  "Late-stay authorization backend no longer preserves OPEN/CLOSED eligibility plus durable guardian delivery.",
);

expect(
  helper.includes(
    "recipient.reason",
  ) &&
    helper.includes(
      "recipient.allowed_until",
    ) &&
    helper.includes(
      "The student remains under school supervision during this approved period.",
    ),
  "Late-stay guardian message no longer contains the reason and approved-until truth.",
);

expect(
  worker.includes(
    "reconcileRecentGuardianAttendanceOperationalPushes",
  ) &&
    worker.includes(
      "operationalReconciled",
    ) &&
    worker.includes(
      "casaOperationalEventKey",
    ),
  "The scheduled guardian worker no longer runs operational reconciliation.",
);

expect(
  background.includes(
    "CASA_M76_GUARDIAN_CLOSURE_LATE_STAY_TRUTH",
  ) &&
    background.includes(
      "operationalEventKey",
    ) &&
    background.includes(
      "casa-operation-",
    ) &&
    foreground.includes(
      "operationalEventKey",
    ) &&
    foreground.includes(
      "casa-operation-",
    ),
  "Foreground/background operational notification dedupe regressed.",
);

expect(
  attendanceUi.includes(
    "Close today",
  ) &&
    !attendanceUi.includes(
      "Close today & notify guardians",
    ),
  "M76R1 manual Close button copy is not corrected.",
);

expect(
  attendanceUi.includes(
    "This is an internal attendance control; the regular closing-time guardian notice is sent automatically from the campus Normal dismissal time.",
  ),
  "M76R1 manual Close explanation does not point guardian-wide notice authority to Normal dismissal.",
);

expect(
  attendanceUi.includes(
    '["OPEN", "CLOSED"].includes(data.session.status)',
  ) &&
    attendanceUi.includes(
      "Use this before or after normal dismissal",
    ),
  "M76R1 After-hours stay is not available/explained for both OPEN and CLOSED attendance.",
);

expect(
  attendanceUi.includes(
    'student.presenceStatus === "ON_CAMPUS" &&\n                              data?.session &&\n                              ["OPEN", "CLOSED"].includes(data.session.status) &&\n                              (student.scannerCheckoutEligible ? (',
  ) &&
    attendanceUi.includes(
      "Select for after-hours stay",
    ),
  "M76R2 ON_CAMPUS student selection is not available while attendance is OPEN or CLOSED.",
);

expect(
  attendanceUi.includes(
    "CASA immediately queues a guardian notification with the reason and approved-until time.",
  ),
  "M76R1 After-hours stay does not explain immediate guardian notification truth.",
);

expect(
  attendanceUi.includes(
    "Normal dismissal also triggers the automatic daily guardian closing-time notice for this branch.",
  ),
  "M76R1 policy UI does not explain automatic Normal dismissal guardian notification.",
);

expect(
  operations.includes(
    "HQ can create and oversee branches, but branch operations belong to that branch administrator.",
  ) &&
    operations.includes(
      "school_branch_admin_assignments",
    ) &&
    operations.includes(
      "requireBranchAttendanceOperatorAccess",
    ),
  "M76R1 branch autonomy protection proof failed.",
);

expect(
  health.includes(
    '"X-CASA-Release-Revision":\n    "M73"',
  ) &&
    health.includes(
      '"X-CASA-Continuity-Sync-Revision":\n    "M74"',
    ) &&
    health.includes(
      '"X-CASA-Continuity-SQL-Revision":\n    "M75"',
    ) &&
    health.includes(
      '"X-CASA-Guardian-Operations-Revision":\n    "M76R2"',
    ),
  "M76R2 health marker is missing or cumulative release markers regressed.",
);

console.log(
  "M76R2 SCHEDULED DISMISSAL + OPEN LATE-STAY SELECTION TRUTH SELFTEST = GREEN",
);
