import fs from "node:fs";

function read(path: string) {
  return fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}
function need(source: string, marker: string, label: string) {
  if (!source.includes(marker)) {
    throw new Error(`${label}: missing ${marker}`);
  }
}
function reject(source: string, marker: string, label: string) {
  if (source.includes(marker)) {
    throw new Error(`${label}: still contains ${marker}`);
  }
}

const session = read("src/server/auth/session.ts");
need(session, "SESSION_IDLE_TIMEOUT_SECONDS", "idle session");
need(session, "authSessions.lastSeenAt", "idle session");
need(session, "touchCurrentAuthSession", "idle session");

const guard = read("src/app/casa-session-activity-guard.tsx");
need(guard, "30 * 60 * 1000", "activity guard");
need(guard, "pointerdown", "activity guard");
need(guard, '"/api/auth/session"', "activity guard");

const network = read("src/app/casa-network-status.tsx");
need(network, "Slow network connection", "network banner");
need(network, "No internet connection", "network banner");
need(network, "--casa-network-banner-height", "network banner");

const summer = read("src/app/api/schools/[slug]/summer/route.ts");
need(summer, "requireSummerBranchAccess", "summer authority");
reject(summer, "ASSIGN_TEACHER", "summer teacher dependency");

const summerClient = read("src/app/schools/[slug]/summer/summer-client.tsx");
need(summerClient, "Admins and School Technicians", "summer UX");
reject(summerClient, "Assign teacher", "summer teacher UI");

const registryStudents = read("src/app/api/schools/[slug]/registry/students/route.ts");
need(registryStudents, "requireRegistryOperator", "technician registry");
reject(registryStudents, "requireRegistryAdmin", "technician registry");

const registry = read("src/app/schools/[slug]/registry/registry-client.tsx");
need(registry, "studentId=", "registry deep link");
need(registry, "selectedStudentId", "registry toggle");

const attendance = read("src/app/schools/[slug]/attendance/attendance-client.tsx");
need(attendance, "useSearchParams", "attendance deep link");
need(attendance, "requestedStudentId", "attendance deep link");

const technician = read("src/app/schools/[slug]/technician/technician-client.tsx");
need(technician, "terminalSetupQr", "terminal setup QR");
need(technician, "useSearchParams", "identity deep link");
reject(technician, "Attendance terminal", "identity navigation");

const scanner = read("src/app/scanner/scanner-client.tsx");
need(scanner, "Scan setup QR", "scanner QR provisioning");
need(scanner, "Setup QR read", "scanner QR provisioning");

const templates = read("src/app/api/internal/operations/templates/route.ts");
need(templates, "supersedesTemplateId", "one school one card");
need(templates, "An ID card has already been created for this organization", "one school one card");

const designer = read("src/app/internal/templates/template-designer.tsx");
need(designer, "An ID card has already been created for this organization", "template fast guard");

const staff = read("src/app/schools/[slug]/staff-access/staff-access-client.tsx");
need(staff, "Email delivery", "staff access email UX");
need(staff, "gap-3", "staff recovery/suspend spacing");

const email = read("src/server/messaging/account-access-email.ts");
need(email, "sendGmailEmail", "account link email");
need(email, "Secure access powered by CASA", "account link email");

for (const path of [
  "src/app/api/schools/[slug]/staff-access/route.ts",
  "src/app/api/schools/[slug]/staff-access/[membershipId]/recovery/route.ts",
  "src/app/api/internal/access/accounts/route.ts",
  "src/app/api/internal/access/accounts/[membershipId]/recovery/route.ts",
  "src/app/api/internal/platform/schools/[schoolId]/owner-recovery/route.ts",
  "src/app/api/schools/[slug]/branches/[branchId]/admins/route.ts",
]) {
  need(read(path), "sendAccountAccessEmail", `email delivery ${path}`);
}

need(
  read("src/app/schools/[slug]/my-class/my-class-client.tsx"),
  "Sign out",
  "teacher sign out",
);

console.log("CASA M47A operational UX closure self-test passed.");
