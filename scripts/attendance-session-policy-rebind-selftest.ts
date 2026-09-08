import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root =
  process.cwd();

function read(
  relative:
    string,
) {
  return fs.readFileSync(
    path.join(
      root,
      relative,
    ),
    "utf8",
  );
}

const schema =
  read(
    "src/db/schema/attendance-operations.ts",
  );

const passkey =
  read(
    "src/server/auth/passkey-step-up.ts",
  );

const service =
  read(
    "src/server/attendance/session-management.ts",
  );

const legacyRoute =
  read(
    "src/app/api/schools/[slug]/attendance/sessions/today/route.ts",
  );

const route =
  read(
    "src/app/api/schools/[slug]/attendance/sessions/today/policy-rebind/route.ts",
  );

const client =
  read(
    "src/app/schools/[slug]/attendance/attendance-client.tsx",
  );

for (
  const marker of [
    "attendanceSessionPolicyRebinds",
    "attendance_session_policy_rebinds",
    "from_policy_id",
    "to_policy_id",
    "passkey_grant_id",
    "policy_changed_check",
  ]
) {
  assert.ok(
    schema.includes(
      marker,
    ),
    `M28 audit schema missing ${marker}`,
  );
}

assert.ok(
  passkey.includes(
    '"ATTENDANCE_SESSION_POLICY_REBIND"',
  ),
  "Dedicated rebind Passkey action missing.",
);

for (
  const marker of [
    "rebindTodayAttendanceSessionPolicy",
    "resolveDefaultPolicyForDate",
    "ATTENDANCE_SESSION_POLICY_REBIND_WINDOW_CLOSED",
    "CHECK_IN_WINDOW_CLOSED",
    "OUTSIDE_WINDOW",
    "a.outcome::text",
    "attendance_session_policy_rebinds",
    "passkeyGrantId",
    "rebind_audit_count",
  ]
) {
  assert.ok(
    service.includes(
      marker,
    ),
    `Rebind service missing ${marker}`,
  );
}

assert.match(
  service,
  /not exists\s*\([\s\S]*student_attendance_records[\s\S]*\)/,
  "Rebind must fail closed when attendance records exist.",
);

assert.match(
  service,
  /not exists\s*\([\s\S]*student_presence_events[\s\S]*\)/,
  "Rebind must fail closed when presence exists.",
);

assert.match(
  service,
  /not exists\s*\([\s\S]*biometric_verification_evidence[\s\S]*\)/,
  "Rebind must fail closed when biometric evidence exists.",
);

assert.ok(
  legacyRoute.includes(
    "requireAttendanceController",
  ),
  "Existing sessions/today route must preserve the Wave 1 controller boundary.",
);

assert.ok(
  !legacyRoute.includes(
    "ATTENDANCE_SESSION_POLICY_REBIND",
  ) &&
    !legacyRoute.includes(
      "policy-rebind",
    ),
  "Existing sessions/today route must not absorb the privileged policy-rebind operation.",
);

for (
  const marker of [
    '"ATTENDANCE_SESSION_POLICY_REBIND"',
    "consumePasskeyStepUpGrantWithId",
    "requireAttendanceManager",
    "rebindTodayAttendanceSessionPolicy",
    "ATTENDANCE_SESSION_POLICY_REBIND_REASON_REQUIRED",
  ]
) {
  assert.ok(
    route.includes(
      marker,
    ),
    `Dedicated rebind route missing ${marker}`,
  );
}

assert.ok(
  client.includes(
    "{canManage && (",
  ) &&
    client.includes(
      "styles.actions",
    ),
  "Attendance management controls must remain inside the existing canManage actions boundary.",
);

for (
  const marker of [
    "rebindSessionPolicy",
    '"ATTENDANCE_SESSION_POLICY_REBIND"',
    "attendance/sessions/today/policy-rebind",
    "Use current policy",
    "data?.session?.status ===",
    '"OPEN"',
    "Earlier rejected scans remain preserved",
  ]
) {
  assert.ok(
    client.includes(
      marker,
    ),
    `Rebind UI missing ${marker}`,
  );
}

console.log(
  "CASA School attendance session policy rebind self-test passed.",
);