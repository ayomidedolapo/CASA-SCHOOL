import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
let passed = 0;

function read(relativePath: string): string {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`Missing required M39 file: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(`M39 SELFTEST FAILED: ${message}`);
  passed += 1;
}

function includes(relativePath: string, ...needles: string[]) {
  const text = read(relativePath);
  for (const needle of needles) {
    assert(text.includes(needle), `${relativePath} is missing required authority: ${needle}`);
  }
}

const migration = "drizzle/20260919211500_m39_operational_ux_closure/migration.sql";
includes(
  migration,
  "add column if not exists mode varchar(24) not null default 'INSTRUCTIONAL'",
  "alter column status set default 'PLANNED'",
  "alter column opened_at drop not null",
  "status in ('PLANNED','OPEN','CLOSED','CANCELLED')",
  "mode in ('INSTRUCTIONAL','PRESENCE_ONLY')",
  "add column if not exists count_for_attendance boolean not null default true",
  "create table if not exists attendance_terminal_health_states",
  "on delete cascade",
);

includes(
  "src/server/attendance/branch-session.ts",
  'export type AttendanceBranchMode = "INSTRUCTIONAL" | "PRESENCE_ONLY"',
  "prepareBranchAttendanceSession",
  'existing.session.status === "CLOSED" || existing.session.status === "CANCELLED"',
  "select session_id from closed",
  "when attendance_sessions.status = 'CLOSED'::attendance_session_status",
  "aggregate.has_open or aggregate.has_planned",
  "bs.status in ('PLANNED','OPEN')",
  "resolvePolicyForMode",
  "mode: context.session.mode",
);

includes(
  "src/app/api/schools/[slug]/branches/[branchId]/attendance/sessions/today/route.ts",
  'z.literal("PREPARE")',
  'z.enum(["INSTRUCTIONAL", "PRESENCE_ONLY"])',
  "prepareBranchAttendanceSession",
  "requirePasskeyStepUpGrant",
  'action: "ATTENDANCE_SESSION_REOPEN"',
  '"PASSKEY_STEP_UP_REQUIRED"',
);

includes(
  "src/app/api/terminal/scan/route.ts",
  'active.session.mode === "PRESENCE_ONLY"',
  'active.session.status !== "OPEN"',
  'active.session.status === "PLANNED"',
  '"ATTENDANCE_BRANCH_NOT_OPEN"',
  'active.session.status === "CLOSED"',
  "findActiveLateStayAuthorization",
  'classification = "LATE_STAY"',
  'classification = "PRESENCE_ONLY"',
);

includes(
  "src/server/attendance/finalize-presence.ts",
  'branchModeRow?.mode === "PRESENCE_ONLY"',
  "count_for_attendance",
  "${!presenceOnly}",
);

includes(
  "src/server/attendance/today.ts",
  "todayDate: liveClock.date",
  "readOnly",
  'session?.mode === "PRESENCE_ONLY"',
  "academicSessionId:",
);

includes(
  "src/server/attendance/student-analytics.ts",
  'row.branch_mode === "PRESENCE_ONLY"',
  "row.count_for_attendance === false",
  'status = "PRESENCE_ONLY"',
);

includes(
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
  'type="date"',
  'mutateSession("PREPARE"',
  "Prepare presence-only",
  "Historical · read only",
  "Presence only · not graded",
  "openStudentHistory",
  "Attendance history",
  "setPendingConfirm(null);",
  "setPendingInput(null);",
);

includes(
  "src/server/card-production/render.ts",
  "renderStudentCardTemplatePreviewSide",
  "renderSide",
);
includes(
  "src/app/api/internal/operations/templates/[templateId]/preview/route.ts",
  'searchParams.get("raw") === "1"',
  "renderStudentCardTemplatePreviewSide",
);
const designer = read("src/app/internal/templates/template-designer.tsx");
assert(designer.includes("&raw=1"), "card designer must request raw artwork only while editing");
assert(!designer.includes("galleryOverlay("), "card gallery must not overlay browser-simulated card fields");

includes(
  "src/server/internal/terminal-health.ts",
  "ATTENDANCE_TERMINAL_OFFLINE",
  "ATTENDANCE_TERMINAL_ONLINE",
  "returning terminal_id::text",
  "if (!created || !terminal.last_seen_at || observed === \"ONLINE\") continue;",
);
includes(
  "src/server/attendance/terminal-auth.ts",
  "reconcileTerminalHealthNotifications",
);
includes(
  "src/app/api/internal/notifications/route.ts",
  "reconcileTerminalHealthNotifications",
);
includes(
  "src/app/internal/page.tsx",
  "Operational notifications",
  "attendance_terminal_health_states",
);

includes(
  "src/server/summer/programmes.ts",
  "listSummerStudentOptions",
  "addExistingSummerParticipant",
);
includes(
  "src/app/schools/[slug]/summer/summer-client.tsx",
  "Add existing student",
  "Guest",
  "guardian",
);

const scannerClient = read("src/app/scanner/scanner-client.tsx");
assert(scannerClient.includes("detail.schoolName"), "Scanner completion must show school identity");
assert(scannerClient.includes("detail.branchName"), "Scanner completion must show campus identity");
assert(scannerClient.includes("detail.className"), "Scanner completion must show class identity");
assert(scannerClient.includes("finalResult.student.casaStudentId"), "Scanner completion must show CASA student identity");

const favicon = path.join(root, "src/app/favicon.ico");
assert(fs.existsSync(favicon), "CASA favicon is missing");
const faviconHash = crypto.createHash("sha256").update(fs.readFileSync(favicon)).digest("hex");
assert(faviconHash === "9324e5bb28f6ad76ac5314e9b7955d42dc0262495b8f6718f4f333bc920a42d6", "CASA favicon bytes drifted from the M39 artifact");

const migration38 = path.join(root, "drizzle/20260918134000_m38_card_lifecycle_template_scope/migration.sql");
assert(fs.existsSync(migration38), "M38 migration authority is missing");
const migration38Hash = crypto.createHash("sha256").update(fs.readFileSync(migration38)).digest("hex");
assert(migration38Hash === "dd3e8e86d50d71b7f199a8e1386c3d10fa4e1b60baa59a55eac20bec39283d15", "M38 migration authority drifted");

console.log(`CASA M39 Operational UX Closure self-test GREEN (${passed} assertions).`);
console.log("M38 authority remains byte-for-byte locked. No database mutation was performed by this self-test.");
