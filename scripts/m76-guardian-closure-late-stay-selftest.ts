import { readFileSync } from "node:fs";
function source(path: string) { return readFileSync(path, "utf8").replace(/\r\n/g, "\n"); }
function expect(value: unknown, message: string) { if (!value) throw new Error(message); }
const migration = source("drizzle/20261012150000_m76_guardian_closure_late_stay_truth/migration.sql");
const helper = source("src/server/messaging/guardian-attendance-operations-push.ts");
const branchSession = source("src/server/attendance/branch-session.ts");
const lateStay = source("src/server/attendance/late-stay.ts");
const sessionRoute = source("src/app/api/schools/[slug]/branches/[branchId]/attendance/sessions/today/route.ts");
const lateStayRoute = source("src/app/api/schools/[slug]/branches/[branchId]/attendance/late-stay/route.ts");
const worker = source("src/server/messaging/guardian-push-worker.ts");
const background = source("src/app/firebase-messaging-sw.js/route.ts");
const foreground = source("src/app/casa-foreground-notifications.tsx");
const attendanceUi = source("src/app/schools/[slug]/attendance/attendance-client.tsx");
const operations = source("src/server/school-operations/operations.ts");
const health = source("src/app/api/health/route.ts");
expect(migration.includes("operational_event_key varchar(240)") && migration.includes("guardian_push_outbox_operational_event_device_unique") && migration.includes("'SCHOOL_DAY_CLOSED'") && migration.includes("'STUDENT_LATE_STAY_AUTHORIZED'") && migration.includes("'SCHOOL_CALENDAR_NOTICE'") && migration.includes("'STUDENT_TEMPORARILY_OUT'"), "M76 guardian outbox migration does not preserve existing event types plus operational dedupe.");
expect(helper.includes("queueGuardianBranchClosurePushes") && helper.includes("queueGuardianLateStayPushes") && helper.includes("reconcileRecentGuardianAttendanceOperationalPushes") && helper.includes("branch_map.branch_id =\n             closure.branch_id") && helper.includes("select distinct on (\n          relationship.guardian_id,\n          device.firebase_installation_id") && helper.includes("'SCHOOL_DAY_CLOSED'") && helper.includes("'STUDENT_LATE_STAY_AUTHORIZED'") && helper.includes("recipient.reason") && helper.includes("recipient.allowed_until"), "M76 guardian operational queue/reconciliation or branch isolation is incomplete.");
expect(branchSession.includes("queueGuardianBranchClosurePushes") && branchSession.includes("and bs.status = 'OPEN'") && branchSession.includes("closed_at") && branchSession.includes("guardianNotificationBatchKey") && branchSession.includes("guardianNotificationQueued"), "Branch close does not preserve close semantics and guardian closure queueing.");
expect(lateStay.includes("queueGuardianLateStayPushes") && lateStay.includes("returning id::text as id") && lateStay.includes("guardianNotificationBatchKey") && lateStay.includes("guardianNotificationQueued"), "Late-stay authorization does not queue durable guardian truth.");
expect(sessionRoute.includes("after,") && sessionRoute.includes("operationalBatchKey") && sessionRoute.includes("runGuardianPushOutbox") && lateStayRoute.includes("after,") && lateStayRoute.includes("operationalBatchKey") && lateStayRoute.includes("runGuardianPushOutbox"), "M76 routes do not trigger immediate best-effort delivery after durable queueing.");
expect(worker.includes("operationalBatchKey?: string") && worker.includes("reconcileRecentGuardianAttendanceOperationalPushes") && worker.includes("operationalBatchFilter") && worker.includes("operationalReconciled") && worker.includes("casaOperationalEventKey"), "Guardian push worker does not support M76 operational batches/reconciliation.");
expect(background.includes("CASA_M76_GUARDIAN_CLOSURE_LATE_STAY_TRUTH") && background.includes("operationalEventKey") && background.includes("casa-operation-") && foreground.includes("operationalEventKey") && foreground.includes("casa-operation-"), "Foreground/background guardian display dedupe for operational alerts is incomplete.");
expect(attendanceUi.includes("Close today & notify guardians") && attendanceUi.includes("Guardian closure notifications were queued where registered") && attendanceUi.includes("guardian notification with the reason and approved-until time") && attendanceUi.includes("Guardian notifications were queued where configured"), "Attendance UI does not explain closure/late-stay guardian notification truth.");
expect(operations.includes("HQ can create and oversee branches, but branch operations belong to that branch administrator.") && operations.includes("school_branch_admin_assignments") && operations.includes("requireBranchAttendanceOperatorAccess"), "M76 branch autonomy protection proof failed.");
expect(health.includes('"X-CASA-Release-Revision":\n    "M73"') && health.includes('"X-CASA-Continuity-Sync-Revision":\n    "M74"') && health.includes('"X-CASA-Continuity-SQL-Revision":\n    "M75"') && health.includes('"X-CASA-Guardian-Operations-Revision":\n    "M76"'), "M76 health marker is missing or cumulative release markers regressed.");
console.log("M76 GUARDIAN CLOSURE + LATE-STAY TRUTH SELFTEST = GREEN");
