import assert from "node:assert/strict";
import fs from "node:fs";

const required = [
  "src/app/internal/onboarding/layout.tsx",
  "src/app/schools/[slug]/my-class/page.tsx",
  "src/app/schools/[slug]/my-class/my-class-client.tsx",
  "src/app/schools/[slug]/staff-access/page.tsx",
  "src/app/schools/[slug]/staff-access/staff-access-client.tsx",
  "src/app/api/schools/[slug]/staff-access/route.ts",
  "src/app/api/schools/[slug]/staff-access/[membershipId]/route.ts",
  "src/app/api/auth/password/status/route.ts",
  "src/app/api/auth/password/change/route.ts",
  "src/app/security/password/page.tsx",
  "src/app/security/password/password-change-client.tsx",
  "src/app/internal/technician/page.tsx",
];

for (const file of required) {
  assert.ok(
    fs.existsSync(file),
    `Missing Development completion file: ${file}`,
  );
}

const read = (file: string) =>
  fs.readFileSync(
    file,
    "utf8",
  );

const login =
  read(
    "src/app/login/login-form.tsx",
  );

for (const marker of [
  "startAuthentication",
  "/api/auth/passkeys/login/options",
  "/api/auth/passkeys/login/verify",
  "/api/auth/password/status",
  "/my-class",
  "/technician",
]) {
  assert.ok(
    login.includes(marker),
    `Login completion marker missing: ${marker}`,
  );
}

const internalLayout =
  read(
    "src/app/internal/onboarding/layout.tsx",
  );

assert.ok(
  internalLayout.includes(
    '@aws-amplify/ui-react/styles.css',
  ),
  "Internal liveness route still lacks Amplify UI styles.",
);

const staffRoute =
  read(
    "src/app/api/schools/[slug]/staff-access/route.ts",
  );

for (const marker of [
  '"ADMIN"',
  '"STAFF"',
  '"SCHOOL_TECHNICIAN"',
  "mustChangePassword",
  "hashPassword",
  "temporaryPassword",
  "requireSchoolRole",
]) {
  assert.ok(
    staffRoute.includes(marker),
    `Staff & Access contract missing: ${marker}`,
  );
}


const staffStatusRoute =
  read(
    "src/app/api/schools/[slug]/staff-access/[membershipId]/route.ts",
  );

assert.ok(
  staffStatusRoute.includes(
    '"SUSPENDED"',
  ) &&
    staffStatusRoute.includes(
      'roles.includes(\n        "OWNER"',
    ),
  "Staff suspend/reactivate boundary is incomplete.",
);

const passwordPage =
  read(
    "src/app/security/password/page.tsx",
  );

assert.ok(
  passwordPage.includes(
    "await searchParams",
  ),
  "Password page must resolve school search params on the server.",
);

const myClass =
  read(
    "src/app/schools/[slug]/my-class/my-class-client.tsx",
  );

assert.ok(
  myClass.includes(
    "/attendance/today",
  ),
  "My Class is not connected to today's attendance endpoint.",
);

const internalTech =
  read(
    "src/app/internal/technician/page.tsx",
  );

assert.ok(
  internalTech.includes(
    "requireCasaInternalAccess",
  ),
  "CASA Team Technician workspace is not protected by CASA internal authority.",
);

const scanner =
  read(
    "src/app/scanner/scanner-client.tsx",
  );

for (const marker of [
  "ScannerInstallControl",
  "beforeinstallprompt",
  "cameraFacing",
  "listCameras",
  "Front camera",
  "ScannerStageRail",
]) {
  assert.ok(
    scanner.includes(marker),
    `Scanner premium completion marker missing: ${marker}`,
  );
}

assert.ok(
  !scanner.includes(
    "Add to Home Screen",
  ) &&
    !scanner.includes(
      "showManualInstall",
    ),
  "Scanner still exposes the rejected manual install fallback.",
);

const manifest =
  read(
    "src/app/scanner/manifest.ts",
  );

assert.ok(
  manifest.includes(
    "name:",
  ) &&
    manifest.includes(
      '"CASA"',
    ) &&
    manifest.includes(
      "/casa-terminal-icon.svg",
    ) &&
    !manifest.includes(
      "CASA School",
    ),
  "Scanner branding must be CASA, not CASA School.",
);

const registry =
  read(
    "src/app/schools/[slug]/registry/registry-client.tsx",
  );

assert.ok(
  registry.includes(
    "Staff & access",
  ),
  "Registry does not expose Staff & Access to administrators.",
);

console.log(
  "CASA School Development full-product completion self-test passed.",
);
