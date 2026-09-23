import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) =>
  fs.readFileSync(path, "utf8");

const enums = read("src/db/schema/attendance-readiness-enums.ts");
const schema = read("src/db/schema/attendance-readiness.ts");
const service = read("src/server/attendance/card-replacement.ts");
const route = read("src/app/api/schools/[slug]/registry/students/[studentId]/card-replacement/route.ts");
const cards = read("src/app/schools/[slug]/registry/student-cards.tsx");
const attendance = read("src/app/schools/[slug]/attendance/attendance-client.tsx");
const early = read("src/app/api/schools/[slug]/attendance/early-departures/[attemptId]/authorize/route.ts");

assert.ok(enums.includes("student_card_replacement_reason"));
assert.ok(enums.includes("student_card_replacement_payment_status"));
assert.ok(schema.includes("paidByMembershipId"));
assert.ok(schema.includes("batchEligibleOn"));
assert.ok(service.includes("markStudentCardReplacementPaid"));
assert.ok(service.includes("CARD_REPLACEMENT_PAYMENT_REQUIRED"));
assert.ok(route.includes("REPORT_DAMAGED"));
assert.ok(route.includes("MARK_PAID"));
assert.ok(cards.includes("Mark damaged"));
assert.ok(cards.includes("Mark replacement paid with Passkey"));
assert.ok(cards.includes("scheduled CASA batch"));
assert.ok(attendance.includes("await response.text()"));
assert.ok(early.includes("EARLY_DEPARTURE_CANCEL_FAILED"));
assert.ok(early.includes("incidentId"));

console.log("CASA replacement foundation source selftest GREEN");
