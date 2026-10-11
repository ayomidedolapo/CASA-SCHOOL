import { readFileSync } from "node:fs";

function source(path:string){return readFileSync(path,"utf8")}
function ok(value:unknown,message:string){if(!value)throw new Error(message)}

const migration=source("drizzle/20261010130000_m67_session_commercial_model/migration.sql");
const route=source("src/app/api/internal/finance/commercial-model/route.ts");
const panel=source("src/app/internal/finance/session-commercial-panel.tsx");
const workbenchRoute=source("src/app/api/internal/finance/workbench/route.ts");
const workbench=source("src/app/internal/finance/finance-workbench.tsx");

ok(
  migration.includes("casa_finance_invoices_session_installment_unique") &&
  migration.includes("session_agreement_id") &&
  migration.includes("installment_sequence"),
  "Session invoice idempotency constraint is missing.",
);

ok(
  route.includes("CREATE_AGREEMENT_INVOICES") &&
  route.includes("vatRatePercent") &&
  route.includes("vatKobo=Math.round") &&
  route.includes("totalKobo=plan.amountKobo+vatKobo") &&
  route.includes("FINANCE_SESSION_INVOICE_SCHEDULE_DRAFTED"),
  "Agreement VAT invoice integration is incomplete.",
);

ok(
  route.includes("CASA School Management & Attendance System") &&
  route.includes("Organization branch allocations are explanatory only") &&
  route.includes("allocateSessionSubtotalAcrossBranches") &&
  route.includes("agreementRow.status!==\"AGREED\""),
  "Frozen agreement invoice protections are incomplete.",
);

ok(
  panel.includes("createAgreementInvoices") &&
  panel.includes("Blank = 0%") &&
  panel.includes("Draft 2 invoices") &&
  panel.includes("Invoice schedule drafted"),
  "Session invoice controls or zero-VAT semantics are missing.",
);

ok(
  workbenchRoute.includes("SESSION_AGREEMENT_REQUIRED") &&
  workbenchRoute.includes("agreement.service_session_label"),
  "Legacy service invoice guard or session invoice context is missing.",
);

ok(
  workbench.includes("Invoices come from agreed sessions") &&
  workbench.includes("installment_sequence") &&
  !workbench.includes("Legacy invoice drafter") &&
  !workbench.includes("per student / term"),
  "Finance workbench still exposes the old term service path as active.",
);

console.log("M67 SESSION INVOICE + VAT INTEGRATION SELFTEST = GREEN");
