import assert from "node:assert/strict";
import fs from "node:fs";

const required = [
  "src/server/school-operations/errors.ts",
  "src/server/school-operations/http.ts",
  "src/server/school-operations/operations.ts",
  "src/app/api/schools/[slug]/branches/route.ts",
  "src/app/api/schools/[slug]/branches/[branchId]/route.ts",
  "src/app/api/schools/[slug]/branches/[branchId]/admins/route.ts",
  "src/app/api/schools/[slug]/branches/[branchId]/structure/route.ts",
  "src/app/api/schools/[slug]/calendar-events/route.ts",
  "src/app/api/schools/[slug]/calendar-events/[eventId]/route.ts",
  "src/app/api/schools/[slug]/attendance/excuses/route.ts",
];

for (const file of required) {
  assert.ok(
    fs.existsSync(file),
    `Missing branch/calendar backend file: ${file}`,
  );
}

const operations =
  fs.readFileSync(
    "src/server/school-operations/operations.ts",
    "utf8",
  );

assert.match(
  operations,
  /role === "OWNER"[\s\S]*role === "ADMIN"/,
);

assert.doesNotMatch(
  operations,
  /SCHOOL_TECHNICIAN[\s\S]*hasOrganizationAdminAuthority/,
);

for (const marker of [
  "school_branch_admin_assignments",
  "school_branch_class_arms",
  "school_branch_terminals",
  "school_calendar_events",
  "student_attendance_excuses",
  "EXCUSE_OVERLAP",
  "STUDENT_BRANCH_MISMATCH",
]) {
  assert.ok(
    operations.includes(marker),
    `Missing operations marker: ${marker}`,
  );
}

console.log(
  "CASA School branch/calendar/excuse backend self-test passed.",
);
