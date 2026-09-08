import assert from "node:assert/strict";
import fs from "node:fs";

const enums =
  fs.readFileSync(
    "src/db/schema/attendance-readiness-enums.ts",
    "utf8",
  );

const schema =
  fs.readFileSync(
    "src/db/schema/attendance-readiness.ts",
    "utf8",
  );

const readiness =
  fs.readFileSync(
    "src/server/attendance/readiness.ts",
    "utf8",
  );

const replacement =
  fs.readFileSync(
    "src/server/attendance/card-replacement.ts",
    "utf8",
  );

const sessionManagement =
  fs.readFileSync(
    "src/server/attendance/session-management.ts",
    "utf8",
  );

const lifecycleRoute =
  fs.readFileSync(
    "src/app/api/schools/[slug]/attendance/lifecycle/route.ts",
    "utf8",
  );

const replacementRoute =
  fs.readFileSync(
    "src/app/api/schools/[slug]/registry/students/[studentId]/card-replacement/route.ts",
    "utf8",
  );

const exceptionRoute =
  fs.readFileSync(
    "src/app/api/schools/[slug]/attendance/card-exceptions/[studentId]/route.ts",
    "utf8",
  );

for (
  const marker of [
    "SETUP",
    "READY",
    "ACTIVE",
    "PAUSED",
    "CARD_REPLACEMENT_PENDING",
    "FACE_EXISTING_PROFILE",
  ]
) {
  assert.ok(
    enums.includes(marker),
    `Missing readiness enum marker: ${marker}`,
  );
}

for (
  const marker of [
    "schoolAttendanceLifecycles",
    "schoolAttendanceLifecycleEvents",
    "studentCardReplacementCases",
    "studentCardAttendanceExceptions",
    "one_pending_per_student",
    "grace_snapshot_check",
  ]
) {
  assert.ok(
    schema.includes(marker),
    `Missing readiness schema marker: ${marker}`,
  );
}

assert.match(
  readiness,
  /findNextInstructionalDate/,
);
assert.match(
  readiness,
  /ATTENDANCE_START_TODAY_CONFIRMATION_REQUIRED/,
);
assert.match(
  readiness,
  /ATTENDANCE_EFFECTIVE_DATE_NOT_REACHED/,
);
assert.match(
  readiness,
  /ATTENDANCE_OPEN_SESSION_MUST_CLOSE/,
);

assert.match(
  sessionManagement,
  /getAttendanceReadinessRejection/,
  "Attendance session opening must be gated by explicit school Go-Live state.",
);

assert.match(
  replacement,
  /MARKED_LOST/,
);
assert.match(
  replacement,
  /CARD_REPLACEMENT_GRACE_EXPIRED/,
);
assert.match(
  replacement,
  /graceDayNumber > 3/,
);
assert.match(
  replacement,
  /PRESENT_CARD_EXCEPTION/,
);
assert.match(
  replacement,
  /'MANUAL'::attendance_record_status/,
);
assert.match(
  replacement,
  /'CHECKED_IN'::attendance_presence_event_type/,
);
assert.match(
  replacement,
  /student_card_replacement_exception_checked_in/,
);
assert.match(
  replacement,
  /STUDENT_CHECKED_IN/,
);
assert.match(
  replacement,
  /cardCompliancePercentage/,
);
assert.doesNotMatch(
  replacement,
  /0\.5|50%|half credit/i,
  "Card compliance must not use an arbitrary weighted attendance penalty.",
);

assert.match(
  lifecycleRoute,
  /requireAttendanceOperator/,
);
assert.match(
  lifecycleRoute,
  /requireAttendanceController/,
);
assert.doesNotMatch(
  lifecycleRoute,
  /await requireAttendanceManager\(/,
  "Attendance lifecycle mutations must use the Wave 1 controller boundary.",
);
assert.match(
  replacementRoute,
  /requireRegistryOperator/,
);
assert.match(
  exceptionRoute,
  /requireRegistryOperator/,
);

console.log(
  "CASA School attendance readiness/card-replacement self-test passed.",
);
