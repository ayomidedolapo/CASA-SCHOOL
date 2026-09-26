import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relative: string): string {
  return readFileSync(
    path.join(root, relative),
    "utf8",
  );
}

const schema =
  read("src/db/schema/guardians.ts");

assert.doesNotMatch(
  schema,
  /student_guardians_one_notification_recipient_per_student_idx/,
  "The obsolete one-notification-recipient-per-student unique index must be removed from the Drizzle schema.",
);

assert.match(
  schema,
  /student_guardians_student_guardian_unique/,
  "The same guardian must still be prevented from being linked twice to the same student.",
);

assert.match(
  schema,
  /student_guardians_one_primary_per_student_idx/,
  "The one-primary-guardian-per-student database invariant must remain.",
);

const linkRoute =
  read(
    "src/app/api/schools/[slug]/registry/students/[studentId]/guardians/route.ts",
  );

assert.match(
  linkRoute,
  /This guardian is already linked to this student\./,
  "Duplicate guardian linking must return a specific user-facing conflict message.",
);

assert.match(
  linkRoute,
  /existingLinkRows[\s\S]*studentGuardians\.guardianId[\s\S]*parsed\.data\.guardianId/,
  "Guardian linking must explicitly detect an already-linked guardian before mutation.",
);

assert.match(
  linkRoute,
  /if \(parsed\.data\.isPrimary\)[\s\S]*await db\.batch\(\[[\s\S]*isPrimary:\s*false[\s\S]*\.insert\([\s\S]*studentGuardians/,
  "Linking a new Primary guardian must clear the previous Primary and insert the new relationship in one database batch.",
);

assert.match(
  linkRoute,
  /receivesNotifications:\s*parsed\.data\.receivesNotifications/,
  "The requested notification preference must still be persisted for every linked guardian.",
);

const guardianUi =
  read(
    "src/app/schools/[slug]/registry/m34a-registry-operations.tsx",
  );

assert.match(
  guardianUi,
  /Every linked guardian may enable notifications on their own devices\. CASA does not limit attendance notifications to one guardian\./,
  "The Registry UI must continue to state the intended multi-guardian notification model.",
);

const pushSource =
  read(
    "src/server/messaging/guardian-presence-push.ts",
  );

assert.match(
  pushSource,
  /join student_guardians relationship[\s\S]*relationship\.receives_notifications\s*=\s*[\s\S]*true[\s\S]*join guardians guardian/,
  "Guardian presence delivery must continue to select every notification-enabled guardian relationship.",
);

const drizzleRoot =
  path.join(root, "drizzle");

const migrationDirs =
  readdirSync(drizzleRoot)
    .filter((name) =>
      statSync(
        path.join(drizzleRoot, name),
      ).isDirectory(),
    );

assert.equal(
  migrationDirs.length,
  44,
  `Expected exactly 44 migration directories after the M47A guardian repair; found ${migrationDirs.length}.`,
);

const dropNeedle =
  'DROP INDEX "student_guardians_one_notification_recipient_per_student_idx"';

const dropMigrations =
  migrationDirs
    .map((name) => ({
      name,
      sql: read(
        path.join(
          "drizzle",
          name,
          "migration.sql",
        ),
      ),
    }))
    .filter(({ sql }) =>
      sql.includes(dropNeedle),
    );

assert.equal(
  dropMigrations.length,
  1,
  "Exactly one migration must remove the obsolete guardian notification unique index.",
);

const normalizedSql =
  dropMigrations[0].sql
    .replace(
      /-->\s*statement-breakpoint/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

assert.equal(
  normalizedSql,
  'DROP INDEX "student_guardians_one_notification_recipient_per_student_idx";',
  "Migration 44 must contain only the intended guardian notification-index removal.",
);

console.log(
  "CASA M47A guardian multi-link repair self-test passed.",
);
