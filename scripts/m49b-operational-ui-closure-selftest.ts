import fs from "node:fs";

function read(path: string) {
  return fs
    .readFileSync(
      path,
      "utf8",
    )
    .replace(
      /\r\n/g,
      "\n",
    );
}

function need(
  source: string,
  marker: string,
  label: string,
) {
  if (!source.includes(marker)) {
    throw new Error(
      `${label}: missing ${marker}`,
    );
  }
}

function forbid(
  source: string,
  marker: string,
  label: string,
) {
  if (source.includes(marker)) {
    throw new Error(
      `${label}: still contains ${marker}`,
    );
  }
}

const overview =
  read(
    "src/app/internal/page.tsx",
  );
need(
  overview,
  "currently offline",
  "CASA scanner wording",
);
need(
  overview,
  "assigned scanner",
  "CASA Team scanner scope wording",
);
forbid(
  overview,
  "not responding",
  "old scanner wording",
);

const scannerPage =
  read(
    "src/app/internal/scanners/page.tsx",
  );
for (
  const marker of [
    "Currently online",
    "Currently offline",
    "interval '5 minutes'",
    "CASA_SUPER_ADMIN",
    "casa_internal_school_assignments",
  ]
) {
  need(
    scannerPage,
    marker,
    "scanner health page",
  );
}

const operations =
  read(
    "src/app/internal/operations/page.tsx",
  );
need(
  operations,
  'href:"/internal/scanners"',
  "scanner health operations entry",
);

const notifications =
  read(
    "src/app/api/internal/notifications/route.ts",
  );
need(
  notifications,
  '"/internal/scanners"',
  "scanner notification destination",
);

const terminalHealth =
  read(
    "src/server/internal/terminal-health.ts",
  );
need(
  terminalHealth,
  'actionUrl: "/internal/scanners"',
  "terminal notification destination",
);

const terminalRoute =
  read(
    "src/app/api/schools/[slug]/attendance/terminals/route.ts",
  );
for (
  const marker of [
    "connectivityStatus",
    "'ONLINE'",
    "'OFFLINE'",
    "interval '5 minutes'",
  ]
) {
  need(
    terminalRoute,
    marker,
    "school scanner API state",
  );
}

const technician =
  read(
    "src/app/schools/[slug]/technician/technician-client.tsx",
  );
need(
  technician,
  "Currently online",
  "technician online label",
);
need(
  technician,
  "Currently offline",
  "technician offline label",
);

const guardian =
  read(
    "src/app/guardian-notifications/[token]/page.tsx",
  );
need(
  guardian,
  "branch_id",
  "branch-aware Apple icon",
);
need(
  guardian,
  "?branchId=",
  "branch logo query",
);
forbid(
  guardian,
  "and link.claimed_at is null",
  "post-claim branding restriction",
);
forbid(
  guardian,
  "and link.expires_at > now()",
  "expired-link icon restriction",
);

const brandingRoute =
  read(
    "src/app/api/schools/[slug]/notification-branding/route.ts",
  );
need(
  brandingRoute,
  "export async function GET",
  "branding read API",
);
need(
  brandingRoute,
  "schoolLogoConfigured",
  "school branding state",
);
need(
  brandingRoute,
  "branchLogoConfigured",
  "branch branding state",
);

const brandingClient =
  read(
    "src/app/schools/[slug]/notification-branding/notification-branding-client.tsx",
  );
for (
  const marker of [
    "School-branded guardian notifications",
    "Save school logo",
    "Save campus logo",
    "school-initials fallback",
  ]
) {
  need(
    brandingClient,
    marker,
    "branding UI",
  );
}

need(
  read(
    "src/app/schools/[slug]/messaging/messaging-client.tsx",
  ),
  "Notification branding",
  "messaging branding navigation",
);

for (
  const path of [
    "src/app/api/internal/card-production/renewal-batches/route.ts",
    "src/app/api/internal/card-production/renewal-batches/[batchId]/route.ts",
    "src/app/api/internal/card-production/renewal-batches/[batchId]/produce/route.ts",
    "src/app/api/internal/card-production/renewal-batches/[batchId]/manifest/route.ts",
  ]
) {
  const source =
    read(
      path,
    );
  need(
    source,
    "PERMANENT_CARD_POLICY",
    `renewal policy lock ${path}`,
  );
  need(
    source,
    "status: 410",
    `renewal gone status ${path}`,
  );
  forbid(
    source,
    "renewal-manifest",
    `legacy renewal manifest import ${path}`,
  );
  forbid(
    source,
    "renewal-production",
    `legacy renewal production import ${path}`,
  );
}

console.log(
  "CASA M49B operational UI closure self-test passed.",
);
