import fs from "node:fs";

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const retry = read("src/server/database/read-retry.ts");
assert(retry.includes("withTransientDatabaseReadRetry") && retry.includes("fetch failed"), "DB read retry missing.");
const session = read("src/server/auth/session.ts");
assert(session.includes("withTransientDatabaseReadRetry"), "Session read retry missing.");
const school = read("src/server/auth/authorization.ts");
assert(school.includes("withTransientDatabaseReadRetry"), "School auth read retry missing.");
const internal = read("src/server/internal/authorization.ts");
assert(internal.includes("withTransientDatabaseReadRetry"), "Internal auth read retry missing.");
const onboarding = read("src/app/internal/onboarding/page.tsx");
assert(onboarding.includes("/login?next=%2Finternal%2Fonboarding") && onboarding.includes("isAuthRequiredError"), "Onboarding redirect missing.");
const login = read("src/app/login/login-form.tsx");
assert(login.includes("initialNextPath") && login.includes("CASA internal access") && login.includes("safeNextPath"), "Internal login return path missing.");
for (const path of [
  "src/app/schools/[slug]/attendance/page.tsx",
  "src/app/schools/[slug]/technician/page.tsx",
  "src/app/schools/[slug]/attendance/transport/page.tsx",
  "src/app/schools/[slug]/technician/attendance/page.tsx",
]) {
  const page = read(path);
  assert(page.includes("AuthRequiredError") && page.includes("&next="), `Protected redirect missing: ${path}`);
}
const pw = read("src/app/security/password/password-change-client.tsx");
assert(pw.includes("nextPath") && pw.includes("safeNextPath"), "Password return path missing.");
console.log("CASA auth runtime resilience self-test passed.");
