import assert from "node:assert/strict";
import fs from "node:fs";

import {
  computeAttendanceMetrics,
} from "../src/server/attendance/student-analytics";
import {
  getAttendanceScopeRejection,
} from "../src/server/attendance/operational-scope";

const metrics =
  computeAttendanceMetrics({
    onTime: 16,
    late: 4,
    manual: 1,
    absent: 3,
    excused: 2,
    nonInstructional: 5,
    pending: 1,
  });

assert.equal(
  metrics.eligibleDays,
  24,
);
assert.equal(
  metrics.attendedDays,
  21,
);
assert.equal(
  metrics.attendancePercentage,
  87.5,
);
assert.equal(
  metrics.punctualityPercentage,
  80,
);
assert.equal(
  metrics.onTimeAttendanceRate,
  66.67,
);
assert.equal(
  metrics.punctualityDenominator,
  20,
);

const baseScope = {
  attendanceDate:
    "2026-09-10",
  terminalBranchId:
    "branch-a",
  terminalBranchName:
    "Main Campus",
  terminalBranchStatus:
    "ACTIVE" as const,
  studentBranchId:
    "branch-a",
  studentBranchName:
    "Main Campus",
  studentBranchStatus:
    "ACTIVE" as const,
  nonInstructionalEvent:
    null,
};

assert.equal(
  getAttendanceScopeRejection(
    baseScope,
    "CHECK_IN",
  ),
  null,
);

assert.equal(
  getAttendanceScopeRejection(
    {
      ...baseScope,
      studentBranchId:
        "branch-b",
    },
    "CHECK_IN",
  )?.code,
  "TERMINAL_BRANCH_MISMATCH",
);

assert.equal(
  getAttendanceScopeRejection(
    {
      ...baseScope,
      studentBranchId:
        "branch-b",
    },
    "AUTO",
  )?.code,
  "TERMINAL_BRANCH_MISMATCH",
  "AUTO must still enforce terminal/student branch matching before biometrics.",
);

assert.equal(
  getAttendanceScopeRejection(
    {
      ...baseScope,
      nonInstructionalEvent: {
        id:
          "event-auto",
        kind:
          "PUBLIC_HOLIDAY",
        title:
          "Public holiday",
      },
    },
    "AUTO",
  ),
  null,
  "AUTO must not guess CHECK_IN versus CHECK_OUT before the existing scanner resolves direction.",
);

assert.equal(
  getAttendanceScopeRejection(
    {
      ...baseScope,
      nonInstructionalEvent: {
        id:
          "event-1",
        kind:
          "PUBLIC_HOLIDAY",
        title:
          "Public holiday",
      },
    },
    "CHECK_IN",
  )?.code,
  "NON_INSTRUCTIONAL_DAY",
);

assert.equal(
  getAttendanceScopeRejection(
    {
      ...baseScope,
      nonInstructionalEvent: {
        id:
          "event-final",
        kind:
          "SCHOOL_BREAK",
        title:
          "School break",
      },
    },
    "CHECK_IN",
  )?.code,
  "NON_INSTRUCTIONAL_DAY",
  "Resolved CHECK_IN must be rejected at the trusted finalization boundary.",
);

assert.equal(
  getAttendanceScopeRejection(
    {
      ...baseScope,
      nonInstructionalEvent: {
        id:
          "event-1",
        kind:
          "PUBLIC_HOLIDAY",
        title:
          "Public holiday",
      },
    },
    "CHECK_OUT",
  ),
  null,
  "Calendar changes must not strand a student who is already on campus.",
);

const sourceChecks: Array<
  [string, RegExp[]]
> = [
  [
    "src/app/api/terminal/scan/route.ts",
    [
      /resolveAttendanceOperationalScope/,
      /getAttendanceScopeRejection/,
    ],
  ],
  [
    "src/server/attendance/finalize-presence.ts",
    [
      /resolveAttendanceOperationalScope/,
      /getAttendanceScopeRejection/,
    ],
  ],
  [
    "src/server/attendance/early-departure.ts",
    [
      /resolveAttendanceOperationalScope/,
      /candidate\.terminalId/,
    ],
  ],
  [
    "src/server/attendance/finalize-early-departure.ts",
    [
      /resolveAttendanceOperationalScope/,
      /getAttendanceScopeRejection/,
    ],
  ],
  [
    "src/server/attendance/today.ts",
    [
      /NON_INSTRUCTIONAL/,
      /EXCUSED/,
      /BRANCH_UNASSIGNED/,
      /branchId/,
      /Promise\.all/,
    ],
  ],
  [
    "src/server/attendance/student-analytics.ts",
    [
      /punctualityPercentage/,
      /attendancePercentage/,
      /calendar_event_id/,
      /excuse_id/,
      /punctualityGrade:\s*null/,
    ],
  ],
];

for (
  const [
    file,
    patterns,
  ] of sourceChecks
) {
  const text =
    fs.readFileSync(
      file,
      "utf8",
    );

  for (
    const pattern of
    patterns
  ) {
    assert.match(
      text,
      pattern,
      `${file} missing ${pattern}`,
    );
  }
}

console.log(
  "CASA School branch/calendar/excuse attendance + punctuality analytics self-test passed.",
);
