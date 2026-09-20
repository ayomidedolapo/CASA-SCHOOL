import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) =>
  readFileSync(join(root, path), "utf8");

const migration = read(
  "drizzle/20260918012500_m36_staging_uat_corrections/migration.sql",
);
assert.match(migration, /BRANCH_ADMIN/);
assert.match(migration, /expires_at/);
assert.match(migration, /48 hours/);
assert.match(
  migration,
  /DROP INDEX IF EXISTS "student_guardians_one_notification_recipient_per_student_idx"/,
);

const internalActivation = read(
  "src/app/api/internal/platform/schools/[schoolId]/students/[studentId]/cards/[cardId]/activate/route.ts",
);
assert.match(internalActivation, /SCHOOL_CARD_ACTIVATION_REQUIRED/);
assert.doesNotMatch(internalActivation, /update student_identity_cards/i);

const schoolHandover = read(
  "src/app/api/schools/[slug]/registry/students/[studentId]/cards/[cardId]/activate/route.ts",
);
assert.match(schoolHandover, /CARD_BULK_ACTIVATE/);
assert.match(schoolHandover, /PASSKEY_STEP_UP_REQUIRED/);

const studentCards = read(
  "src/app/schools/[slug]/registry/student-cards.tsx",
);
assert.match(studentCards, /Confirm handover with Passkey/);
assert.match(studentCards, /CARD_BULK_ACTIVATE/);

const internalSchool = read(
  "src/app/internal/schools/[schoolId]/school-detail-client.tsx",
);
assert.doesNotMatch(internalSchool, />\\s*Activate card\\s*</);
assert.match(internalSchool, /School\/Branch Admin action/);
assert.match(internalSchool, /Set up Branch Admin/);
assert.match(internalSchool, /Create new setup link/);

const internalBranches = read(
  "src/app/api/internal/platform/schools/[schoolId]/branches/route.ts",
);
assert.match(internalBranches, /PROVISION_ADMIN/);
assert.match(internalBranches, /REISSUE_ADMIN_SETUP/);
assert.match(internalBranches, /BRANCH_ADMIN/);

const branches = read(
  "src/app/schools/[slug]/branches/branches-client.tsx",
);
assert.match(branches, /Organization campus directory/);
assert.match(branches, /Provision Branch Admin/);
assert.match(branches, /branches\/provisioning/);

const guardianInvite = read(
  "src/app/api/schools/[slug]/registry/students/[studentId]/guardians/[linkId]/push-invite/route.ts",
);
assert.match(guardianInvite, /48 hours/);
assert.match(guardianInvite, /expires_at/);

const guardianApi = read(
  "src/app/api/guardian-notifications/[token]/route.ts",
);
assert.equal(
  (guardianApi.match(/link\.expires_at > now\(\)/g) ?? []).length,
  2,
);
assert.match(guardianApi, /receives_notifications = true/);

const studentDetail = read(
  "src/app/api/schools/[slug]/registry/students/[studentId]/route.ts",
);
assert.match(studentDetail, /activeNotificationDevices/);
assert.match(studentDetail, /notificationInviteState/);

const guardianOps = read(
  "src/app/schools/[slug]/registry/m34a-registry-operations.tsx",
);
assert.match(guardianOps, /Notifications active/);
assert.match(guardianOps, /Notification link expired/);
assert.match(guardianOps, /Create new link/);
assert.match(guardianOps, /48 hours/);
assert.match(guardianOps, /casa:guardian-registry-changed/);

const guardianClient = read(
  "src/app/guardian-notifications/[token]/guardian-notification-client.tsx",
);
assert.match(guardianClient, /if \(!isAppleMobile\(\)\)/);
assert.match(guardianClient, /Notification\.permission/);
assert.match(guardianClient, /Android and desktop do not need CASA installed/);

const guardianSchema = read(
  "src/db/schema/guardians.ts",
);
assert.doesNotMatch(
  guardianSchema,
  /student_guardians_one_notification_recipient_per_student_idx/,
);

const renderer = read(
  "src/server/card-production/render.ts",
);
assert.match(renderer, /VECTOR_GLYPHS/);
assert.match(renderer, /vectorTextLine/);
assert.doesNotMatch(renderer, /DejaVu Sans/);

const productionClient = read(
  "src/app/internal/card-production/card-production-client.tsx",
);
assert.doesNotMatch(productionClient, /CASA preview/);
assert.match(productionClient, />Preview</);

console.log(
  "CASA M37 post-M36 Staging UAT corrections self-test passed.",
);
