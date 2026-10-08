import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function expect(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const migration = read(
  "drizzle/20261008013000_m64_finance_foundation/migration.sql",
);
const pricingRoute = read(
  "src/app/api/internal/finance/pricing/route.ts",
);
const billingRoute = read(
  "src/app/api/internal/finance/billing-profile/route.ts",
);
const panel = read(
  "src/app/internal/finance/negotiated-pricing-panel.tsx",
);
const financeClient = read(
  "src/app/internal/finance/finance-client.tsx",
);

for (const table of [
  "casa_school_billing_profiles",
  "casa_finance_invoices",
  "casa_finance_invoice_lines",
  "casa_finance_payments",
  "casa_finance_expenses",
  "casa_finance_recurring_expenses",
  "casa_finance_email_deliveries",
  "casa_finance_ledger_accounts",
  "casa_finance_journal_entries",
  "casa_finance_journal_lines",
]) {
  expect(
    migration.includes(`"${table}"`),
    `M64 migration missing ${table}.`,
  );
}

expect(
  migration.includes('"agreement_note"') &&
    migration.includes('"agreed_at"'),
  "M64 pricing negotiation metadata missing.",
);

expect(
  pricingRoute.includes('scopeKind: z.enum(["GLOBAL", "SCHOOL", "BRANCH"])') &&
    pricingRoute.includes("agreementNote") &&
    pricingRoute.includes("effective_to"),
  "Negotiated pricing route is incomplete.",
);

expect(
  billingRoute.includes("casa_school_billing_profiles") &&
    billingRoute.includes("owner_email") &&
    billingRoute.includes("defaultTaxRatePercent"),
  "Billing profile route is incomplete.",
);

expect(
  panel.includes("Negotiated school pricing") &&
    panel.includes('scopeKind: "SCHOOL"') &&
    panel.includes("Dedicated billing email") &&
    panel.includes("Current invoice destination") &&
    panel.includes("School Owner fallback") &&
    panel.includes("Dedicated billing contact") &&
    panel.includes("Default tax rate (%)"),
  "Negotiated pricing/billing UI is incomplete.",
);

expect(
  financeClient.includes("NegotiatedPricingPanel") &&
    financeClient.includes("Reference pricing") &&
    financeClient.includes("Set fallback prices"),
  "Finance client did not adopt negotiated-school pricing semantics.",
);

console.log("M64_FINANCE_FOUNDATION_SOURCE=GREEN");
console.log("NEGOTIATED_SCHOOL_PRICING=GREEN");
console.log("SCHOOL_BILLING_PROFILE=GREEN");
console.log("INVOICE_PAYMENT_RECEIPT_SCHEMA=GREEN");
console.log("EXPENSE_RECURRING_SCHEMA=GREEN");
console.log("DOUBLE_ENTRY_LEDGER_SCHEMA=GREEN");