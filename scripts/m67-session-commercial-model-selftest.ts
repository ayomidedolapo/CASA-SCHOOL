import { readFileSync } from "node:fs";
function s(p:string){return readFileSync(p,"utf8")}
function ok(v:unknown,m:string){if(!v)throw new Error(m)}
const migration=s("drizzle/20261010130000_m67_session_commercial_model/migration.sql");
const route=s("src/app/api/internal/finance/commercial-model/route.ts");
const panel=s("src/app/internal/finance/session-commercial-panel.tsx");
const page=s("src/app/internal/finance/page.tsx");
ok(migration.includes("55000000")&&migration.includes("200000")&&migration.includes("3000000"),"Default commercial values missing.");
ok(migration.includes("casa_finance_session_agreements")&&migration.includes("TWO_INSTALLMENTS"),"Session agreement persistence missing.");
ok(route.includes("UPDATE_DEFAULTS")&&route.includes("SAVE_AGREEMENT")&&route.includes("MARK_AGREED"),"Commercial API incomplete.");
ok(panel.includes("ID Card Branding & Production Service")&&panel.includes("Parent or student remittance is not part of CASA Finance")&&panel.includes("Two agreed installments"),"Commercial UI policy incomplete.");
ok(page.includes("SessionCommercialPanel")&&!page.includes("<FinanceClient"),"Legacy term estimator still rendered.");
console.log("M67 SESSION COMMERCIAL MODEL SELFTEST = GREEN");
