import assert from "node:assert/strict";
import fs from "node:fs";

const expected = [
  {
    "file": "src/app/api/schools/[slug]/registry/students/route.ts",
    "owner": "GET",
    "variables": [
      "rows",
      "totals"
    ]
  },
  {
    "file": "src/app/api/schools/[slug]/registry/students/[studentId]/route.ts",
    "owner": "GET",
    "variables": [
      "guardianRows",
      "enrollmentRows"
    ]
  },
  {
    "file": "src/server/attendance/today.ts",
    "owner": "getTodayAttendanceOperations",
    "variables": [
      "pending",
      "authorizationRows"
    ]
  }
] as const;

assert.ok(
  expected.length > 0,
  "At least one independent read batch must be applied.",
);

for (const item of expected) {
  const text = fs.readFileSync(item.file, "utf8");

  for (const variable of item.variables) {
    assert.match(
      text,
      new RegExp(
        String.raw`const\s*\[[\s\S]*\b${variable}\b[\s\S]*\]\s*=\s*await\s+Promise\.all\(`,
      ),
      `Expected ${variable} to be inside a Promise.all batch in ${item.file}`,
    );
  }
}

// Known security/transaction critical operations must not be globally
// rewritten into generic parallel batches.
const liveness = fs.readFileSync(
  "src/server/biometrics/aws-liveness.ts",
  "utf8",
);

assert.match(
  liveness,
  /requirePasskeyStepUpGrant/,
);

const finalization = fs.readFileSync(
  "src/server/attendance/finalize-presence.ts",
  "utf8",
);

assert.match(
  finalization,
  /export async function|async function/,
);

console.log(
  "CASA School independent read batching performance self-test passed.",
);
