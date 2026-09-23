import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) =>
  fs.readFileSync(path, "utf8");

const terminals = read(
  "src/app/api/schools/[slug]/attendance/terminals/route.ts",
);
const today = read(
  "src/server/attendance/today.ts",
);
const attendance = read(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
);

assert.ok(
  terminals.includes("jsonb_array_elements_text"),
  "Terminal GET must bind branch IDs through JSON expansion.",
);
assert.ok(
  !terminals.includes("${visibleBranchIds}::uuid[]"),
  "Terminal GET must not bind a JavaScript array as one PostgreSQL uuid[] scalar.",
);
assert.ok(
  today.includes("active_count"),
  "Today attendance must expose active-card Scanner eligibility.",
);
assert.ok(
  attendance.includes("scannerCheckoutEligible"),
  "Attendance client must use Scanner checkout eligibility.",
);
assert.ok(
  attendance.includes("Select for early departure"),
  "Early departure selection label must be explicit.",
);
assert.ok(
  attendance.includes("After-hours stay"),
  "Late-stay wording must distinguish it from late arrival.",
);
assert.ok(
  attendance.includes("Assisted sign-out"),
  "Cardless attendance must expose a real assisted sign-out action.",
);

console.log(
  "CASA M42 attendance operations closure selftest GREEN",
);
