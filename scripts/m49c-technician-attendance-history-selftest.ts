import fs from "node:fs";

function read(
  path: string,
) {
  return fs
    .readFileSync(
      path,
      "utf8",
    )
    .replace(
      /\r\n/g,
      "\n",
    );
}

function requireText(
  source: string,
  marker: string,
  label: string,
) {
  if (!source.includes(marker)) {
    throw new Error(
      `Missing ${label}: ${marker}`,
    );
  }
}

function forbidText(
  source: string,
  marker: string,
  label: string,
) {
  if (source.includes(marker)) {
    throw new Error(
      `Unexpected ${label}: ${marker}`,
    );
  }
}

const page =
  read(
    "src/app/schools/[slug]/attendance/page.tsx",
  );

requireText(
  page,
  'roles.includes(\n      "SCHOOL_TECHNICIAN",',
  "technician attendance role",
);

requireText(
  page,
  "canSuperviseAttendance =\n    canManageSessions;",
  "technician attendance supervision authority",
);

const client =
  read(
    "src/app/schools/[slug]/attendance/attendance-client.tsx",
  );

requireText(
  client,
  "{canSuperviseAttendance &&\n                              selectedBranchId && (",
  "History visibility for attendance operators",
);

requireText(
  client,
  "History",
  "existing History label",
);

requireText(
  client,
  "void openStudentHistory(student)",
  "existing attendance history action",
);

forbidText(
  client,
  "{canManage && selectedBranchId && (",
  "legacy manager-only History gate",
);

const route =
  read(
    "src/app/api/schools/[slug]/branches/[branchId]/students/[studentId]/attendance-analytics/route.ts",
  );

requireText(
  route,
  "requireBranchAttendanceOperatorAccess",
  "technician-aware branch attendance authority",
);

forbidText(
  route,
  "requireBranchAccess(",
  "legacy branch-admin-only analytics authority",
);

const operations =
  read(
    "src/server/school-operations/operations.ts",
  );

for (
  const marker of [
    "export async function requireBranchAttendanceOperatorAccess",
    'role ===\n          "SCHOOL_TECHNICIAN"',
    "visibility.branches",
  ]
) {
  requireText(
    operations,
    marker,
    "assigned-campus technician authority",
  );
}

console.log(
  "CASA M49C technician attendance history self-test passed.",
);
