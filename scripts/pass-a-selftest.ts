import fs from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`PASS_A_SELFTEST_FAILED: ${message}`);
  }
}

const root = process.cwd();
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), "utf8");
const contains = (relative: string, value: string) =>
  read(relative).includes(value);

const enums = read("src/db/schema/student-enums.ts");
assert(enums.includes('"READY_FOR_ACTIVATION"'), "card pending-handover enum missing");
assert(enums.includes('"ACTIVATED"'), "card activation event enum missing");

const identity = read("src/db/schema/student-identity.ts");
assert(identity.includes('.default("READY_FOR_ACTIVATION")'), "new card default is not READY_FOR_ACTIVATION");
assert(identity.includes("student_identity_cards_one_pending_activation_per_student_idx"), "pending-card uniqueness guard missing");

const production = read("src/server/card-production/production.ts");
assert(/academicSession:\s*null,/.test(production), "normal production still snapshots Academic Session");
assert(production.includes("'READY_FOR_ACTIVATION'::student_identity_card_status"), "normal production does not create pending-handover cards");

const handover = read("src/server/card-production/handover.ts");
for (const signal of [
  "'PRINTED'::student_card_production_status",
  "'READY_FOR_ACTIVATION'::student_identity_card_status",
  "'REPLACED'::student_identity_card_status",
  "'ACTIVE'::student_identity_card_status",
  "'ACTIVATED'::student_identity_card_event_type",
]) {
  assert(handover.includes(signal), `handover lifecycle signal missing: ${signal}`);
}
assert(handover.includes("requireBranchAccess"), "card handover is not branch-authorized");

const supervised = read("src/server/attendance/supervised-arrival.ts");
assert(supervised.includes('mode: "FIRST_CARD"'), "first-card attendance path missing");
assert(supervised.includes("FIRST_CARD_PENDING_HANDOVER"), "first-card audit reason missing");
assert(supervised.includes("'MANUAL'::attendance_record_status"), "first-card exception must remain MANUAL");
assert(supervised.includes('mode: "LATE"'), "supervised late-arrival path missing");
assert(supervised.includes("'LATE'::attendance_record_status"), "after-window arrival is not persisted as LATE");
assert(supervised.includes("SUPERVISED_AFTER_WINDOW_LATE"), "supervised-late audit reason missing");
assert(supervised.includes("requireBranchAccess"), "supervised attendance is not branch-authorized");
assert(supervised.includes("card_count = 1") || supervised.includes("card_count"), "first-card-only guard missing");

const lifecycleRoute = read("src/app/api/schools/[slug]/attendance/lifecycle/route.ts");
assert(lifecycleRoute.includes("requireAttendanceManager"), "lifecycle mutation is not Owner/Admin constrained");
assert(lifecycleRoute.includes('"SCHEDULE_RESUME"'), "scheduled resume API action missing");
assert(lifecycleRoute.includes('"CANCEL_SCHEDULED_RESUME"'), "scheduled resume cancellation missing");

const readiness = read("src/server/attendance/readiness.ts");
assert(readiness.includes("applyDueScheduledResume"), "due scheduled resume materialization missing");
assert(readiness.includes("scheduled_resume_at <= now()"), "due scheduled resume time guard missing");
assert(readiness.includes("'RESUME_SCHEDULED'::school_attendance_lifecycle_event_type"), "scheduled-resume audit event missing");
assert(readiness.includes("'RESUME_SCHEDULE_CANCELLED'::school_attendance_lifecycle_event_type"), "scheduled-resume cancellation audit event missing");

const technicianPage = read("src/app/schools/[slug]/technician/attendance/page.tsx");
assert(technicianPage.includes('role === "OWNER"') && technicianPage.includes('role === "ADMIN"'), "technician page lifecycle authority gate missing");
assert(!technicianPage.includes('role === "SCHOOL_TECHNICIAN" ||'), "technician appears to retain lifecycle authority");

const onboardingApi = read("src/app/api/internal/onboarding/schools/[schoolId]/students/[studentId]/enrollment/route.ts");
assert(onboardingApi.includes("branchId"), "Branch is not required by onboarding API");
assert(onboardingApi.includes("arrivalMethod"), "Arrival Method is not required by onboarding API");
assert(onboardingApi.includes('"SCHOOL_BUS"') && onboardingApi.includes('"INDEPENDENT"'), "arrival-method choices are incomplete");

const onboarding = read("src/server/internal/onboarding.ts");
assert(onboarding.includes("school_branch_class_arms"), "onboarding does not validate Branch/Class mapping");
assert(onboarding.includes("assigned_by_internal_membership_id"), "CASA-internal arrival attribution missing");
assert(onboarding.includes("from valid_scope"), "onboarding validated-scope guard missing");
assert(onboarding.includes("and exists (\n            select 1\n            from valid_scope\n          )"), "destructive onboarding close is not gated by valid scope");

const progression = read("src/server/school-operations/progression.ts");
assert(!progression.includes("student_card_renewal_batches"), "progression still creates a physical-card renewal batch");
assert(!progression.includes("student_card_renewal_batch_items"), "progression still creates physical-card renewal items");
assert(!progression.includes("'CLASS_CHANGE'::student_card_renewal_reason"), "class progression still triggers physical-card renewal");
assert(progression.includes("renewalItems:\n        0"), "progression compatibility response does not report zero routine renewals");

const renewal = read("src/server/card-production/renewal-production.ts");
assert(renewal.includes("function routineCardRenewalDisabled(): boolean"), "runtime permanent-card renewal policy helper missing");
assert((renewal.match(/routineCardRenewalDisabled()/g) ?? []).length === 3, "permanent-card renewal policy is not guarding both legacy entrypoints");
assert((renewal.match(/ROUTINE_CARD_RENEWAL_DISABLED/g) ?? []).length === 2, "legacy renewal entrypoints are not both fail-closed");
assert(renewal.includes("Class and academic-session changes are digital only"), "permanent-card renewal policy message missing");

const templateRoute = read("src/app/api/internal/card-production/templates/route.ts");
assert(templateRoute.includes("CARD_TEMPLATE_CLASS_FORBIDDEN"), "new templates can still register Class");
assert(templateRoute.includes("CARD_TEMPLATE_ACADEMIC_SESSION_FORBIDDEN"), "new templates can still register Academic Session");

const render = read("src/server/card-production/render.ts");
assert(render.includes('CLASS:\n        ""'), "legacy Class is not suppressed at render time");
assert(render.includes('ACADEMIC_SESSION:\n        ""'), "legacy Academic Session is not suppressed at render time");
assert(render.includes('item.source !==\n            "ACADEMIC_SESSION"'), "legacy Academic Session template item is not filtered");
assert(render.includes('item.source !==\n            "CLASS"'), "legacy Class template item is not filtered");
assert(render.includes("function fitText("), "bounded text fitting missing");
assert(render.includes("function wrapText("), "bounded text wrapping missing");
assert(render.includes("minFontSize"), "bounded font shrink missing");

const registryCards = read("src/app/schools/[slug]/registry/student-cards.tsx");
assert(registryCards.includes("This physical card remains valid across class and"), "Registry does not explain long-lived physical-card policy");
assert(registryCards.includes("Replace card with Passkey"), "Registry still presents routine reissue wording");

const cardProductionSources = [
  "src/server/card-production/template-layout.ts",
  "src/server/card-production/render.ts",
  "src/db/schema/card-production.ts",
  "src/server/card-production/production.ts",
  "src/server/card-production/renewal-production.ts",
].map(read).join("\n");
assert(!/(STUDENT_PHOTO|studentPhoto|student_photo|portraitKey|portrait_key|photoKey|photo_key)/.test(cardProductionSources), "dynamic student-photo source detected in physical-card pipeline");

const migrationsDir = path.join(root, "drizzle");
const migrationCount = fs.readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => fs.existsSync(path.join(migrationsDir, entry.name, "migration.sql")))
  .length;
assert(migrationCount === 30, `expected 30 migrations after Pass A, found ${migrationCount}`);

const enumMigration = read("drizzle/20260909020000_pass-a-enum-expansion/migration.sql");
const stateMigration = read("drizzle/20260909020500_pass-a-handover-attendance-state/migration.sql");
assert(enumMigration.includes("READY_FOR_ACTIVATION") && enumMigration.includes("RESUME_SCHEDULED"), "enum-expansion migration incomplete");
assert(stateMigration.includes("student_first_card_attendance_exceptions"), "first-card audit migration missing");
assert(stateMigration.includes("student_supervised_late_arrivals"), "supervised-late audit migration missing");
assert(stateMigration.includes("assigned_by_internal_membership_id"), "internal arrival attribution migration missing");
assert(stateMigration.includes("student_arrival_method_assignments_actor_guard_trigger"), "future arrival actor trigger missing");
assert(stateMigration.includes("TG_OP = 'INSERT'"), "arrival actor trigger does not enforce new assignments");
assert(stateMigration.includes("IS DISTINCT FROM OLD"), "arrival actor trigger does not protect future actor changes");

console.log("CASA School Pass A source contract self-test passed.");
