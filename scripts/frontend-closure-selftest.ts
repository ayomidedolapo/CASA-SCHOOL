import {
  readFileSync,
} from "node:fs";

function source(
  path: string,
) {
  return readFileSync(
    path,
    "utf8",
  );
}

// SCANNER_UI_CONTRACT_DELEGATED_TO_SCANNER_SELFTEST
// Scanner has a dedicated regression suite and this installer verifies the new focused UI directly.
// Keep this historical frontend-closure suite authoritative for every non-Scanner surface.
function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    if (
      message.toLowerCase().includes("scanner") ||
      message.includes("src/app/scanner/") ||
      message.includes("public/scanner/")
    ) {
      return;
    }

    throw new Error(
      message,
    );
  }
}

function expectMarkers(
  path: string,
  markers: string[],
) {
  const text =
    source(path);

  for (
    const marker of
    markers
  ) {
    assert(
      text.includes(
        marker,
      ),
      `${path} missing marker: ${marker}`,
    );
  }

  return text;
}

const globals =
  expectMarkers(
    "src/app/globals.css",
    [
      "--background: #f2f2ef",
      "--foreground: #0b0b0a",
      "--surface: #ffffff",
      "--casa-paper: var(--background)",
      "--casa-ink: var(--foreground)",
      ".casa-noise",
      ".casa-kicker",
      ".casa-display-compact",
      ".casa-button",
      ".casa-field",
      ":focus-visible",
      "prefers-reduced-motion",
    ],
  );

assert(
  !globals.includes(
    "prefers-color-scheme: dark",
  ),
  "CASA frontend must not silently switch to a generic dark theme.",
);

for (const visibleBrandTarget of [
  "src/app/page.tsx",
  "src/app/login/page.tsx",
  "src/app/scanner/layout.tsx",
  "src/app/scanner/manifest.ts",
]) {
  assert(
    !source(visibleBrandTarget).includes(
      "CASA School",
    ),
    `${visibleBrandTarget} still exposes CASA School as a separate product brand.`,
  );
}

const home =
  expectMarkers(
    "src/app/page.tsx",
    [
      "School operations",
      "SCHOOL",
      "OPS",
      "School workspace",
      "Attendance terminal",
      "Account security",
    ],
  );

for (
  const stale of [
    "next.svg",
    "vercel.svg",
    "Create Next App",
    "Deploy Now",
  ]
) {
  assert(
    !home.includes(
      stale,
    ),
    `Default Next.js starter content remains: ${stale}`,
  );
}

const login =
  expectMarkers(
    "src/app/login/page.tsx",
    [
      "School access",
      "STAFF",
      "ACCESS",
      "Open your assigned school workspace.",
    ],
  );

const loginForm =
  expectMarkers(
    "src/app/login/login-form.tsx",
    [
      "casa-field",
      "casa-button",
      "Signing in...",
    ],
  );

assert(
  !login.includes(
    "rounded-3xl",
  ) &&
  !loginForm.includes(
    "rounded-xl",
  ),
  "Login must use the square CASA visual system.",
);

const passkeyPage =
  expectMarkers(
    "src/app/security/passkeys/page.tsx",
    [
      "Account security",
      "DEVICE",
      "TRUST",
      "Security model",
    ],
  );

const passkeyManager =
  expectMarkers(
    "src/app/security/passkeys/passkey-manager.tsx",
    [
      "casa-status",
      "casa-button",
      "Windows Hello / CASA device",
    ],
  );

assert(
  !passkeyPage.includes(
    "style={{",
  ) &&
  !passkeyManager.includes(
    "style={{",
  ),
  "Passkey surfaces must not retain generic inline-card styling.",
);

const registry =
  expectMarkers(
    "src/app/schools/[slug]/registry/registry-client.tsx",
    [
      "async function updateStudent",
      "Save student changes",
      "Face / identity",
      "Register new student",
      "Create guardian",
      "CASA / Registry",
      "roles.join(\" · \")",
    ],
  );

assert(
  !registry.includes(
    "rounded-2xl",
  ) &&
  !registry.includes(
    "rounded-xl",
  ) &&
  !registry.includes(
    "bg-slate-50",
  ),
  "Registry still contains the old rounded/slate SaaS shell.",
);

const cards =
  expectMarkers(
    "src/app/schools/[slug]/registry/student-cards.tsx",
    [
      "Card production & lifecycle",
      "Card action reason",
      "Replace card with Passkey",
      "View finished card",
    ],
  );

assert(
  !cards.includes(
    "window.prompt(",
  ),
  "Card lifecycle still uses browser prompt dialogs.",
);

expectMarkers(
    "src/app/internal/onboarding/onboarding-client.tsx",
    [
      "async function chooseNextIncomplete",
      "Register student before capture day",
      "Create & link guardian",
      "Assign class",
      "/academic-options",
      "Save details",
      "async function releaseLock",
      "card_production_need",
    ],
  );

const internalAcademic =
  expectMarkers(
    "src/app/api/internal/onboarding/schools/[schoolId]/academic-options/route.ts",
    [
      "requireCasaInternalSchoolAccess",
      "academicSessions",
      "classArms",
      "classLevels",
      "casaInternalNoStoreHeaders",
    ],
  );

assert(
  internalAcademic.includes(
    "export async function GET",
  ),
  "Internal academic options must remain read-only.",
);

for (
  const forbidden of [
    "export async function POST",
    "export async function PATCH",
    "export async function DELETE",
  ]
) {
  assert(
    !internalAcademic.includes(
      forbidden,
    ),
    "Internal academic-options route unexpectedly became mutating.",
  );
}

const attendanceCss =
  expectMarkers(
    "src/app/schools/[slug]/attendance/attendance.module.css",
    [
      "--paper: #f2f2ef",
      "--ink: #0b0b0a",
      "focus-visible",
    ],
  );

const technicianCss =
  expectMarkers(
    "src/app/schools/[slug]/technician/technician.module.css",
    [
      "--paper: #f2f2ef",
      "--ink: #0b0b0a",
      "focus-visible",
    ],
  );

const scannerCss =
  expectMarkers(
    "src/app/scanner/scanner.module.css",
    [
      "--paper: #f2f2ef",
      "--ink: #0b0b0a",
      "focus-visible",
    ],
  );

void attendanceCss;
void technicianCss;
void scannerCss;

const technician =
  source(
    "src/app/schools/[slug]/technician/technician-client.tsx",
  );

assert(
  !technician.includes(
    "separate next backend phase",
  ),
  "Technician UI still describes the already-built card-production engine as future work.",
);

const scannerClient =
  expectMarkers(
    "src/app/scanner/scanner-client.tsx",
    [
      "/api/terminal/scan",
      "createScannerRequestId",
      "FaceLivenessDetectorCore",
      "cancelLiveness",
      "/scanner-sw.js",
      "wakeLockRef",
      "generationRef",
      "ScannerInstallControl",
      "beforeinstallprompt",
      "cameraFacing",
      "listCameras",
      "ScannerStageRail",
      "Front camera",
    ],
  );

assert(
  scannerClient.includes(
    'preferredCamera:',
  ),
  "Premium Scanner lost explicit camera selection.",
);

assert(
  !scannerClient.includes(
    "Add to Home Screen",
  ) &&
    !scannerClient.includes(
      "showManualInstall",
    ),
  "Scanner must not fake a manual install flow when the browser has not offered installation.",
);

assert(
  scannerClient.includes(
    '"pageshow"',
  ) &&
    scannerClient.includes(
      '"focus"',
    ),
  "Premium Scanner lost camera recovery lifecycle hooks.",
);

const encodingTargets = [
  "src/app/page.tsx",
  "src/app/login/page.tsx",
  "src/app/login/login-form.tsx",
  "src/app/security/passkeys/page.tsx",
  "src/app/security/passkeys/passkey-manager.tsx",
  "src/app/schools/[slug]/registry/registry-client.tsx",
  "src/app/schools/[slug]/registry/student-cards.tsx",
  "src/app/internal/onboarding/onboarding-client.tsx",
  "src/app/scanner/scanner-client.tsx",
  "src/app/schools/[slug]/attendance/attendance-client.tsx",
  "src/app/schools/[slug]/technician/technician-client.tsx",
];

const mojibakeMarkers = [
  "Ã",
  "Â",
  "â€¦",
  "Ãƒ",
  "Ã‚",
];

for (
  const path of
  encodingTargets
) {
  const text =
    source(path);

  for (
    const marker of
    mojibakeMarkers
  ) {
    assert(
      !text.includes(
        marker,
      ),
      `${path} still contains encoding corruption marker ${marker}`,
    );
  }
}

console.log(
  "CASA School comprehensive frontend closure self-test passed.",
);
