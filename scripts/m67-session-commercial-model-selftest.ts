import { readFileSync } from "node:fs";

function source(path:string){return readFileSync(path,"utf8")}
function ok(value:unknown,message:string){if(!value)throw new Error(message)}

const migration=source("drizzle/20261010130000_m67_session_commercial_model/migration.sql");
const route=source("src/app/api/internal/finance/commercial-model/route.ts");
const panel=source("src/app/internal/finance/session-commercial-panel.tsx");
const page=source("src/app/internal/finance/page.tsx");
const hub=source("src/app/internal/finance/finance-hub.tsx");

ok(
  migration.includes("55000000") &&
  migration.includes("200000") &&
  migration.includes("3000000"),
  "Default commercial values missing.",
);

ok(
  migration.includes("casa_finance_session_agreements") &&
  migration.includes("TWO_INSTALLMENTS"),
  "Session agreement persistence missing.",
);

ok(
  route.includes("UPDATE_DEFAULTS") &&
  route.includes("SAVE_AGREEMENT") &&
  route.includes("MARK_AGREED"),
  "Commercial API incomplete.",
);

ok(
  panel.includes("Student ID Card Branding & Production Service") &&
  panel.includes("Parent or student remittance is not part of CASA Finance") &&
  panel.includes("Two agreed installments"),
  "Commercial UI policy incomplete.",
);

ok(
  page.includes("<FinanceHub />") &&
  !page.includes("<FinanceClient") &&
  !hub.includes("FinanceClient") &&
  hub.includes("<SessionCommercialPanel />"),
  "Session commercial model is not the Finance commercial source of truth.",
);

console.log("M67 SESSION COMMERCIAL MODEL SELFTEST = GREEN");
