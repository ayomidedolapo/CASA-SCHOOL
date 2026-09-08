// CASA_PHASE_3K_PASSKEY_REGISTRATION_UI
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relative: string) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing expected file: ${relative}`);
  }
  return fs.readFileSync(file, "utf8");
}

const helper = read("src/client/passkey-registration.ts");
const manager = read("src/app/security/passkeys/passkey-manager.tsx");
const page = read("src/app/security/passkeys/page.tsx");
const optionsRoute = read("src/app/api/auth/passkeys/register/options/route.ts");
const verifyRoute = read("src/app/api/auth/passkeys/register/verify/route.ts");
const listRoute = read("src/app/api/auth/passkeys/route.ts");

if (!helper.includes("startRegistration")) {
  throw new Error("Passkey registration helper does not use the real WebAuthn browser ceremony.");
}
if (!helper.includes("/api/auth/passkeys/register/options")) {
  throw new Error("Registration helper does not call the existing options route.");
}
if (!helper.includes("/api/auth/passkeys/register/verify")) {
  throw new Error("Registration helper does not call the existing verify route.");
}
if (!helper.includes("optionsBody.ceremonyId")) {
  throw new Error("Registration helper does not preserve the server-issued ceremonyId.");
}
if (!helper.includes("ceremonyId,")) {
  throw new Error("Registration verify payload does not include ceremonyId.");
}
if (!helper.includes("response,")) {
  throw new Error("Registration verify payload does not include the WebAuthn response.");
}
if (!manager.includes("Register Passkey")) {
  throw new Error("Passkey management UI has no registration action.");
}
if (!manager.includes("listPasskeys")) {
  throw new Error("Passkey management UI does not show current registration state.");
}
if (!page.includes("PasskeyManager")) {
  throw new Error("Security page does not render Passkey management.");
}
if (!optionsRoute.includes("beginPasskeyRegistration")) {
  throw new Error("Existing registration options route contract drifted.");
}
if (!verifyRoute.includes("finishPasskeyRegistration")) {
  throw new Error("Existing registration verify route contract drifted.");
}
if (!listRoute.includes("authPasskeys")) {
  throw new Error("Existing Passkey listing route contract drifted.");
}

console.log("CASA School Passkey registration UI self-test passed.");
