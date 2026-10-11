import { existsSync, readFileSync } from "node:fs";

function source(path: string) {
  if (!existsSync(path)) throw new Error(`Missing protected release file: ${path}`);
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

function expect(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const scanner = source("src/app/scanner/scanner-client.tsx");
const scannerCss = source("src/app/scanner/scanner.module.css");
const connectivity = source("src/scanner/connectivity-health.ts");
const storage = source("src/scanner/continuity-storage.ts");
const card = source("src/scanner/continuity-card.ts");
const sync = source("src/server/attendance/continuity-sync.ts");
const syncRoute = source("src/app/api/terminal/continuity/sync/route.ts");
const bootstrap = source("src/app/api/terminal/continuity/bootstrap/route.ts");
const connectivityRoute = source("src/app/api/terminal/connectivity/route.ts");
const worker = source("public/scanner-sw.js");

const financePage = source("src/app/internal/finance/page.tsx");
const financeHub = source("src/app/internal/finance/finance-hub.tsx");
const financeOverview = source("src/app/internal/finance/finance-overview.tsx");
const commercial = source("src/app/api/internal/finance/commercial-model/route.ts");
const panel = source("src/app/internal/finance/session-commercial-panel.tsx");
const allocation = source("src/server/finance/session-branch-allocation.ts");

expect(
  scanner.includes("2026-10-10-m66-offline-continuity") &&
  scanner.includes("connectivityPanel") &&
  scanner.includes("Continuity ready") &&
  scanner.includes("Offline continuity is active") &&
  scanner.includes("pending sync"),
  "PROTECTED REGRESSION: M66 scanner network reader/offline continuity UI disappeared.",
);

expect(
  scanner.includes('"/api/terminal/connectivity"') &&
  scanner.includes('"/api/terminal/continuity/bootstrap"') &&
  scanner.includes('"/api/terminal/continuity/sync"') &&
  connectivityRoute.includes("touch: false") &&
  bootstrap.includes("token_hash") &&
  !bootstrap.includes("qrPayload"),
  "PROTECTED REGRESSION: M66 connectivity/continuity API contract disappeared.",
);

expect(
  connectivity.includes('"DEGRADED"') &&
  connectivity.includes('"OFFLINE"') &&
  connectivity.includes('"RECOVERING"') &&
  storage.includes("casa-school-scanner-continuity") &&
  card.includes("crypto.subtle") &&
  worker.includes("CASA_SCANNER_CACHE") &&
  scannerCss.includes("connectivityPanel"),
  "PROTECTED REGRESSION: M66 local continuity engine disappeared.",
);

expect(
  sync.includes("CONNECTIVITY_CONTINUITY_OFFLINE") &&
  sync.includes("CONNECTIVITY_CONTINUITY_TEMPORARY_EXIT") &&
  sync.includes("TEMPORARY_RETURN_REQUIRES_FRESH_SCAN") &&
  syncRoute.includes("runGuardianPushOutboxForPresenceEvent"),
  "PROTECTED REGRESSION: M66 continuity sync/temporary movement safety disappeared.",
);

expect(
  financePage.includes("<FinanceHub />") &&
  financeHub.includes("<FinanceOverview />") &&
  financeHub.includes("<SessionCommercialPanel />") &&
  financeOverview.includes("Commercial conversion") &&
  financeOverview.includes("Cash effort") &&
  financeOverview.includes("School contribution") &&
  financeOverview.includes("What needs action") &&
  financeOverview.includes("Issued invoice value"),
  "PROTECTED REGRESSION: M67 Finance UX disappeared.",
);

expect(
  commercial.includes("CREATE_AGREEMENT_INVOICES") &&
  commercial.includes("allocateSessionSubtotalAcrossBranches") &&
  commercial.includes("Organization branch allocation") &&
  panel.includes("Student ID Card Branding & Production Service") &&
  allocation.includes("allocateSessionSubtotalAcrossBranches"),
  "PROTECTED REGRESSION: M67 session commercial/branch invoice model disappeared.",
);

console.log("M66 + M67 CUMULATIVE RELEASE REGRESSION GATE = GREEN");