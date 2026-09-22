import assert from "node:assert/strict";
import fs from "node:fs";

const read = (
  path: string,
) =>
  fs.readFileSync(
    path,
    "utf8",
  );

const guardianSchema =
  read(
    "src/db/schema/guardians.ts",
  );
const attendanceSchema =
  read(
    "src/db/schema/attendance-operations.ts",
  );
const early =
  read(
    "src/server/attendance/early-departure.ts",
  );
const scan =
  read(
    "src/app/api/terminal/scan/route.ts",
  );
const attendanceClient =
  read(
    "src/app/schools/[slug]/attendance/attendance-client.tsx",
  );
const attendancePage =
  read(
    "src/app/schools/[slug]/attendance/page.tsx",
  );
const operations =
  read(
    "src/server/school-operations/operations.ts",
  );
const guardianRoute =
  read(
    "src/app/api/schools/[slug]/registry/students/[studentId]/guardians/[linkId]/route.ts",
  );
const registryClient =
  read(
    "src/app/schools/[slug]/registry/m34a-registry-operations.tsx",
  );
const presence =
  read(
    "src/server/attendance/finalize-presence.ts",
  );
const provider =
  read(
    "src/server/messaging/simhostng-provider.ts",
  );
const scannerContracts =
  read(
    "src/scanner/contracts.ts",
  );
const preauthorizeRoute =
  read(
    "src/app/api/schools/[slug]/attendance/early-departures/preauthorize/route.ts",
  );

assert.ok(
  guardianSchema.includes(
    "student_guardians_one_notification_recipient_per_student_idx",
  ),
  "Guardian schema must enforce one attendance SMS recipient.",
);
assert.ok(
  guardianSchema.includes(
    ".default(false)",
  ),
  "New guardian notification links must not silently create extra SMS recipients.",
);

for (
  const marker of [
    "attendanceEarlyDeparturePreauthorizations",
    "attendance_early_departure_preauthorizations_active_student_idx",
    "consumedAttemptId",
    "passkeyGrantId",
  ]
) {
  assert.ok(
    attendanceSchema.includes(
      marker,
    ),
    `Preauthorization schema marker missing: ${marker}`,
  );
}

for (
  const marker of [
    "preauthorizeEarlyDepartures",
    "EARLY_DEPARTURE_AUTHORITY_REQUIRED",
    "school_branch_admin_assignments",
    "SCHOOL_TECHNICIAN",
    "alreadyAuthorized",
  ]
) {
  assert.ok(
    early.includes(
      marker,
    ),
    `Early-departure service marker missing: ${marker}`,
  );
}

assert.ok(
  preauthorizeRoute.includes(
    "studentIds",
  ) &&
    preauthorizeRoute.includes(
      "branchId",
    ) &&
    preauthorizeRoute.includes(
      "x-casa-passkey-step-up",
    ),
  "Selected-student preauthorization route is incomplete.",
);

for (
  const marker of [
    "attendanceEarlyDeparturePreauthorizations",
    "EARLY_DEPARTURE_PREAUTHORIZATION_ALREADY_USED",
    "insert into attendance_early_departure_authorizations",
    "consumed_attempt_id",
  ]
) {
  assert.ok(
    scan.includes(
      marker,
    ),
    `Scanner preauthorization marker missing: ${marker}`,
  );
}

assert.ok(
  attendanceClient.includes(
    "Authorize selected with Passkey",
  ) &&
    attendanceClient.includes(
      "different classes",
    ) &&
    attendanceClient.includes(
      "earlyDeparturePreauthorized",
    ),
  "Attendance UI must support mixed-class selected-student early departure.",
);

assert.ok(
  attendancePage.includes(
    "isTechnician",
  ) &&
    attendancePage.includes(
      "canSuperviseAttendance",
    ),
  "Technician supervised-attendance capability is missing.",
);

assert.ok(
  operations.includes(
    'access.roles.includes(',
  ) &&
    operations.includes(
      '"SCHOOL_TECHNICIAN"',
    ) &&
    operations.includes(
      "organizationAdmin: false",
    ),
  "Technician must use explicit branch views rather than Organization-wide aggregation.",
);

assert.ok(
  guardianRoute.includes(
    "export async function PATCH",
  ) &&
    guardianRoute.includes(
      "receivesNotifications",
    ),
  "Guardian relationship route must support attendance-notification selection.",
);

assert.ok(
  registryClient.includes(
    'name="receivesNotifications"',
  ) &&
    registryClient.includes(
      "Create notification link",
    ) &&
    registryClient.includes(
      "Notifications active",
    ),
  "Registry must expose the current guardian notification controls.",
);

assert.ok(
  presence.includes(
    "'STUDENT_CHECKED_IN'::school_notification_event_type",
  ),
  "Successful arrival must queue an arrival SMS.",
);

for (
  const marker of [
    "has arrived at school and checked in successfully",
    "has checked out of school for the day",
    "has checked out of school early",
    "CASA - Do not reply.",
  ]
) {
  assert.ok(
    provider.includes(
      marker,
    ),
    `Guardian SMS wording marker missing: ${marker}`,
  );
}

assert.ok(
  scannerContracts.includes(
    "Attendance is closed for today. Normal student scanning has ended.",
  ),
  "Scanner must clearly stop normal attendance after check-out close.",
);

console.log(
  "CASA departure + guardian SMS refinement source contract passed.",
);
