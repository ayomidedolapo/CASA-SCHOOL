import fs from "node:fs";
import path from "node:path";

function read(rel: string) {
  return fs
    .readFileSync(path.join(process.cwd(), rel), "utf8")
    .replace(/\r\n/g, "\n");
}

function need(source: string, marker: string | RegExp, label: string) {
  const ok =
    typeof marker === "string"
      ? source.includes(marker)
      : marker.test(source);

  if (!ok) {
    throw new Error(`M58 failed: ${label}`);
  }

  console.log(`GREEN: ${label}`);
}

const server = read("src/server/attendance/supervised-arrival.ts");
const client = read(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
);

need(
  server,
  'input.mode === "LATE"',
  "server still distinguishes supervised late mode",
);
need(
  server,
  "clock.clock <= closesAt",
  "server rejects supervised late before check-in closes",
);
need(
  server,
  "clock.clock > checkoutClosesAt",
  "server rejects supervised late after checkout closes",
);
need(
  server,
  '"SUPERVISED_LATE_WINDOW_REQUIRED"',
  "server authoritative late-window rejection code preserved",
);
need(
  server,
  '"ACTIVE_BIOMETRIC_PROFILE_REQUIRED"',
  "M57 supervised-late biometric identity guard preserved",
);

need(
  client,
  /policyDay:\s*\|\s*\{[\s\S]*checkInClosesAt:\s*string;[\s\S]*checkOutClosesAt:\s*string;[\s\S]*\|\s*null;/,
  "Today UI types the policy-day time window",
);

const recordLate = client.indexOf("Record late");
if (recordLate < 0) {
  throw new Error("M58 failed: Record late control missing");
}
const control = client.slice(
  Math.max(0, recordLate - 1200),
  recordLate + 300,
);

need(
  control,
  'data.session.mode === "INSTRUCTIONAL"',
  "Record late remains instructional-only",
);
need(
  control,
  "data.policyDay &&",
  "Record late requires an authoritative policy day",
);
need(
  control,
  "data.clock.clock >",
  "Record late waits until after the current school clock threshold",
);
need(
  control,
  "data.policyDay.checkInClosesAt.slice(0, 5)",
  "Record late opens only after configured check-in close",
);
need(
  control,
  "data.clock.clock <=",
  "Record late remains bounded by checkout close",
);
need(
  control,
  "data.policyDay.checkOutClosesAt.slice(0, 5)",
  "Record late closes with configured checkout window",
);

need(
  client,
  "window.setInterval(",
  "Attendance page still refreshes automatically",
);
need(
  client,
  "15_000",
  "Attendance page refresh cadence remains 15 seconds",
);
need(
  client,
  'kind: "TEMPORARY_EXIT"',
  "M57 temporary step-out UI preserved",
);

console.log(
  "RESULT: M58 SUPERVISED LATE WINDOW UI CLOSURE GREEN",
);
