import assert from "node:assert/strict";
import fs from "node:fs";

function read(relative: string) {
  return fs.readFileSync(relative,"utf8");
}

const client = read("src/app/guardian-notifications/[token]/guardian-notification-client.tsx");
const activation = read("src/app/api/guardian-notifications/[token]/route.ts");
const devices = read("src/app/api/schools/[slug]/registry/students/[studentId]/guardians/[linkId]/devices/route.ts");
const manager = read("src/app/schools/[slug]/registry/guardian-notification-device-manager.tsx");
const registry = read("src/app/schools/[slug]/registry/m34a-registry-operations.tsx");
const worker = read("src/server/messaging/guardian-push-worker.ts");
const presence = read("src/server/messaging/guardian-presence-push.ts");
const guardianSchema = read("src/db/schema/guardians.ts");
const guardianLinkRoute = read("src/app/api/schools/[slug]/registry/students/[studentId]/guardians/route.ts");

assert.match(client,/currentPermission\s*===\s*"granted"[\s\S]*\?\s*"granted"[\s\S]*requestPermission/);
assert.match(client,/permissionRecovery[\s\S]*PROMPT_NOT_SHOWN[\s\S]*BLOCKED/);
assert.match(client,/focus[\s\S]*visibilitychange|visibilitychange[\s\S]*focus/);
assert.match(client,/isAppleMobile\(\)[\s\S]*!isStandalone\(\)/);
assert.match(client,/isAndroid\(\)[\s\S]*isChromeFamily\(\)/);

assert.match(activation,/student_guardian_link_id[\s\S]*firebase_installation_id[\s\S]*on conflict/);
assert.match(activation,/status\s*=\s*[\r\n\s]*'ACTIVE'/);
assert.match(devices,/requireRegistryOperator/);
assert.match(devices,/listVisibleBranches/);
assert.match(devices,/consumePasskeyStepUpGrantWithId[\s\S]*SECURITY_SETTINGS/);
assert.match(devices,/student_guardian_link_id[\s\S]*linkId/);
assert.match(devices,/status\s*=\s*'DISABLED'/);
assert.match(worker,/device\.status[\s\S]*'ACTIVE'/);
assert.match(presence,/student_guardian_link_id/);
assert.match(manager,/Disable for this student/);
assert.match(registry,/GuardianNotificationDeviceManager/);

assert.doesNotMatch(
  guardianSchema,
  /student_guardians_one_notification_recipient_per_student_idx/,
  "The obsolete one-notification-recipient-per-student unique index must remain absent.",
);
assert.match(
  guardianSchema,
  /student_guardians_student_guardian_unique/,
  "The same guardian must still be prevented from being linked twice to the same student.",
);
assert.match(
  guardianSchema,
  /student_guardians_one_primary_per_student_idx/,
  "The one-primary-guardian-per-student invariant must remain.",
);
assert.match(
  guardianLinkRoute,
  /receivesNotifications:\s*parsed\.data\.receivesNotifications/,
  "Every linked guardian notification preference must still be persisted.",
);
assert.match(
  registry,
  /Every linked guardian may enable notifications on their own devices\. CASA does not limit attendance notifications to one guardian\./,
  "The Registry UI must preserve the intended multi-guardian notification model.",
);

const guardianDropMigrationPath =
  "drizzle/20260926003108_m47a-guardian-multi-recipient/migration.sql";

assert.equal(
  fs.existsSync(
    guardianDropMigrationPath,
  ),
  true,
  "The exact M47A guardian multi-recipient migration must still exist.",
);

const normalizedGuardianDropSql =
  fs
    .readFileSync(
      guardianDropMigrationPath,
      "utf8",
    )
    .replace(
      /-->\s*statement-breakpoint/g,
      "",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();

assert.equal(
  normalizedGuardianDropSql,
  'DROP INDEX "student_guardians_one_notification_recipient_per_student_idx";',
  "Migration 44 must remain the exact intended obsolete guardian notification-index removal.",
);

console.log("CASA guardian notification Chrome + device lifecycle self-test passed.");
