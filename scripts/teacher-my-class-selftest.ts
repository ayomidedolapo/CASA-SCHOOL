import assert from "node:assert/strict";
import fs from "node:fs";

function read(
  file: string,
) {
  return fs.readFileSync(
    file,
    "utf8",
  );
}

const schema =
  read(
    "src/db/schema/teacher-assignments.ts",
  );

for (
  const marker of [
    "schoolTeacherClassAssignments",
    "school_teacher_class_assignments",
    "membershipId",
    "academicSessionId",
    "classArmId",
    "assignedByMembershipId",
    "revokedByMembershipId",
    "school_teacher_class_assignments_teacher_session_class_unique",
    "school_teacher_class_assignments_membership_fk",
    "school_teacher_class_assignments_session_fk",
    "school_teacher_class_assignments_class_arm_fk",
  ]
) {
  assert.ok(
    schema.includes(
      marker,
    ),
    `Teacher assignment schema missing ${marker}.`,
  );
}

const schemaIndex =
  read(
    "src/db/schema/index.ts",
  );

assert.ok(
  schemaIndex.includes(
    'export * from "./teacher-assignments";',
  ),
);

const drizzleConfig =
  read(
    "drizzle.config.ts",
  );

assert.ok(
  drizzleConfig.includes(
    "./src/db/schema/teacher-assignments.ts",
  ),
);

const service =
  read(
    "src/server/teacher/my-class.ts",
  );

for (
  const marker of [
    'requireSchoolRole',
    '"STAFF"',
    "school_teacher_class_assignments",
    "assignment.membership_id",
    "assignment.academic_session_id",
    "assignment.class_arm_id",
    "requireAssignedTeacherClass",
    "requireTeacherStudentInClass",
    "student_enrollments",
    "school_membership_roles",
  ]
) {
  assert.ok(
    service.includes(
      marker,
    ),
    `Teacher scope service missing ${marker}.`,
  );
}

const today =
  read(
    "src/server/attendance/today.ts",
  );

assert.match(
  today,
  /classArmId\?:/,
);

assert.match(
  today,
  /academicSessionId\?:/,
);

assert.match(
  today,
  /enrollment\.class_arm_id\s*=\s*\$\{input\.classArmId/,
);

assert.match(
  today,
  /enrollment\.academic_session_id\s*=\s*\$\{input\.academicSessionId/,
);

const routeChecks:
  Array<
    [
      string,
      RegExp[],
    ]
  > = [
    [
      "src/app/api/schools/[slug]/teacher/classes/route.ts",
      [
        /requireTeacherAccess/,
        /listTeacherClasses/,
      ],
    ],
    [
      "src/app/api/schools/[slug]/teacher/classes/[classArmId]/attendance/today/route.ts",
      [
        /requireAssignedTeacherClass/,
        /getTodayAttendanceOperations/,
        /classArmId:/,
        /academicSessionId:/,
      ],
    ],
    [
      "src/app/api/schools/[slug]/teacher/classes/[classArmId]/students/[studentId]/attendance-analytics/route.ts",
      [
        /requireTeacherStudentInClass/,
        /getStudentAttendanceAnalytics/,
        /sessionId/,
        /termId/,
        /punctuality/,
      ],
    ],
    [
      "src/app/api/schools/[slug]/teacher-assignments/route.ts",
      [
        /"OWNER"/,
        /"ADMIN"/,
        /setTeacherClassAssignment/,
      ],
    ],
  ];

for (
  const [
    file,
    patterns,
  ] of routeChecks
) {
  const text =
    read(
      file,
    );

  for (
    const pattern of
      patterns
  ) {
    assert.match(
      text,
      pattern,
      `${file} missing ${pattern}.`,
    );
  }
}

const teacherGroupByRecoverySource =
  read(
    "src/server/teacher/my-class.ts",
  );

assert.match(
  teacherGroupByRecoverySource,
  /academic_session\.status,\s*academic_session\.starts_on,\s*assignment\.class_arm_id,/,
  "Teacher class listing must GROUP BY academic_session.starts_on when ordering by it.",
);

const teacherFiles =
  [
    "src/server/teacher/my-class.ts",
    "src/server/teacher/http.ts",
    "src/app/api/schools/[slug]/teacher/classes/route.ts",
    "src/app/api/schools/[slug]/teacher/classes/[classArmId]/attendance/today/route.ts",
    "src/app/api/schools/[slug]/teacher/classes/[classArmId]/students/[studentId]/attendance-analytics/route.ts",
  ]
    .map(
      read,
    )
    .join(
      "\n",
    );

assert.doesNotMatch(
  teacherFiles,
  /insert\s+into\s+.*report|update\s+.*report|reportCard|report_card/i,
  "Teacher My-Class attendance closure must not introduce report-card writes.",
);

const teacherHttp =
  read(
    "src/server/teacher/http.ts",
  );

assert.match(
  teacherHttp,
  /SchoolAccessDeniedError/,
  "Teacher HTTP mapper must recognize school role denial.",
);

assert.match(
  teacherHttp,
  /TEACHER_ACCESS_DENIED/,
  "Teacher HTTP mapper must expose a stable access-denied code.",
);

assert.match(
  teacherHttp,
  /SchoolAccessDeniedError[\s\S]*status:\s*403/,
  "School role denial on Teacher routes must return HTTP 403.",
);

console.log(
  "CASA School Teacher My-Class assignment/scope/attendance self-test passed.",
);
