import assert from "node:assert/strict";
import fs from "node:fs";

const read =
  (filePath: string) =>
    fs.readFileSync(
      filePath,
      "utf8",
    );

const compact =
  (value: string) =>
    value.replace(
      /\s+/g,
      " ",
    );

function section(
  source: string,
  startMarker: string,
  endMarker: string,
) {
  const start =
    source.indexOf(
      startMarker,
    );
  const end =
    source.indexOf(
      endMarker,
      start +
        startMarker.length,
    );

  assert.ok(
    start >= 0,
    `Missing section start: ${startMarker}`,
  );
  assert.ok(
    end > start,
    `Missing section end: ${endMarker}`,
  );

  return source.slice(
    start,
    end,
  );
}

const rekognition =
  read(
    "src/server/biometrics/aws-rekognition.ts",
  );
const liveness =
  read(
    "src/server/biometrics/aws-liveness.ts",
  );
const scanner =
  read(
    "src/app/api/terminal/scan/route.ts",
  );
const onboarding =
  read(
    "src/server/internal/onboarding.ts",
  );
const audit =
  read(
    "src/server/school-operations/audit.ts",
  );
const auditPage =
  read(
    "src/app/schools/[slug]/audit/page.tsx",
  );
const attendancePage =
  read(
    "src/app/schools/[slug]/attendance/page.tsx",
  );
const progression =
  read(
    "src/server/school-operations/progression.ts",
  );
const progressionApi =
  read(
    "src/app/api/schools/[slug]/progression/batches/[batchId]/decisions/route.ts",
  );
const progressionSchema =
  read(
    "src/db/schema/school-operations.ts",
  );
const m40 =
  read(
    "drizzle/20260921140500_m40_identity_lifecycle_closure/migration.sql",
  );

const enrollment =
  section(
    liveness,
    "export async function completeAwsEnrollmentLiveness",
    "export async function startAwsVerificationLiveness",
  );

const verification =
  section(
    liveness,
    "export async function completeAwsVerificationLiveness",
    "export async function cancelAwsEnrollmentLiveness",
  );

const displayDetail =
  section(
    scanner,
    "async function studentDisplayDetail",
    "async function studentPresenceRecord",
  );

const onboardingSearch =
  section(
    onboarding,
    "export async function searchCasaOnboardingStudents",
    "export async function getCasaOnboardingStudent",
  );

const onboardingDetail =
  section(
    onboarding,
    "export async function getCasaOnboardingStudent",
    "export async function createCasaOnboardingStudent",
  );

assert.ok(
  rekognition.includes(
    "export async function searchAwsFaceCandidates",
  ) &&
  rekognition.includes(
    "SearchFacesByImageCommand",
  ),
  "Enrollment must search the school face collection before indexing.",
);

const duplicateSearch =
  enrollment.indexOf(
    "searchAwsFaceCandidates",
  );
const enrollmentIndex =
  enrollment.indexOf(
    "indexAwsStudentFace",
  );

assert.ok(
  duplicateSearch >=
    0 &&
  enrollmentIndex >
    duplicateSearch,
  "Duplicate-person search must happen before a new face vector is indexed.",
);

for (
  const marker of [
    "FACE_ALREADY_ENROLLED_TO_ANOTHER_STUDENT",
    "studentBiometricProfiles.studentId",
    "inArray(",
    "policy.faceMinConfidenceBps",
  ]
) {
  assert.ok(
    enrollment.includes(
      marker,
    ),
    `Duplicate face enrollment guard missing ${marker}`,
  );
}

const compactExpectedSearch =
  compact(
    section(
      rekognition,
      "export async function searchAwsExpectedFace",
      "export async function deleteAwsFace",
    ),
  );

assert.ok(
  compactExpectedSearch.includes(
    "match.Face?.FaceId === input.expectedFaceId",
  ),
  "AWS face verification must require the exact expected FaceId.",
);

const compactVerification =
  compact(
    verification,
  );

for (
  const marker of [
    "studentId: biometricLivenessSessions.studentId",
    "eq( studentBiometricProfiles.studentId, session.studentId, )",
    "expectedFaceId: profile.providerSubjectRef",
    "studentId: session.studentId",
  ]
) {
  assert.ok(
    compactVerification.includes(
      marker,
    ),
    `Scanner student-bound biometric authority missing: ${marker}`,
  );
}

const compactSearch =
  compact(
    onboardingSearch,
  );
const compactDetail =
  compact(
    onboardingDetail,
  );

for (
  const marker of [
    "guardian.guardian_count > 0",
    "enrollment.id is not null",
    "enrollment.branch_id is not null",
    "enrollment.arrival_method is not null",
    "biometric.active_count > 0",
  ]
) {
  assert.ok(
    compactSearch.includes(
      marker,
    ),
    `Capture Ops list completion truth missing: ${marker}`,
  );
}

for (
  const marker of [
    'item.status === "ACTIVE"',
    "item.branch_id",
    "item.arrival_method",
    'student.face_status === "COMPLETE"',
  ]
) {
  assert.ok(
    compactDetail.includes(
      marker,
    ),
    `Capture Ops detail completion truth missing: ${marker}`,
  );
}

for (
  const marker of [
    "school_structure_change_events",
    "attendance_terminal_events",
    "student_biometric_profile_events",
    "attendance_branch_sessions",
    "student_progression_batches",
    "student_progression_decisions",
    "school_branch_admin_assignments",
  ]
) {
  assert.ok(
    audit.includes(
      marker,
    ),
    `School audit source missing ${marker}`,
  );
}

assert.ok(
  auditPage.includes(
    "Who did what, and when.",
  ) &&
  attendancePage.includes(
    "Audit trail",
  ),
  "School/Branch Admin audit must be visible from Attendance.",
);

const compactDisplay =
  compact(
    displayDetail,
  );

assert.ok(
  compactDisplay.includes(
    "e.status='ACTIVE'",
  ) &&
  compactDisplay.includes(
    'as "className"',
  ),
  "Scanner class display must resolve the current ACTIVE enrollment.",
);

for (
  const source of [
    progression,
    progressionApi,
    progressionSchema,
    m40,
  ]
) {
  assert.ok(
    source.includes(
      "TRANSITIONED",
    ),
    "Primary-to-Secondary transition is not wired through every progression boundary.",
  );
}

assert.ok(
  progression.includes(
    "INVALID_SECTION_TRANSITION_TARGET",
  ) &&
  progression.includes(
    "Use TRANSITIONED for Primary-to-Secondary",
  ),
  "Section transition must be separated from ordinary promotion.",
);

const transitionedSqlCount =
  (
    progression.match(
      /'TRANSITIONED'::student_progression_decision/g,
    ) ??
    []
  ).length;

assert.ok(
  transitionedSqlCount >=
    3,
  "TRANSITIONED must participate in continuing-student progression SQL.",
);

assert.ok(
  progression.includes(
    "'GRADUATED'::student_progression_decision",
  ) &&
  progression.includes(
    "'WITHDRAWN'::student_progression_decision",
  ),
  "GRADUATED/WITHDRAWN must remain true school-exit decisions.",
);

console.log(
  "CASA Report Closure M40 source self-test passed.",
);
