import fs from "node:fs";
import path from "node:path";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const expect = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};

const route = read("src/app/api/internal/finance/workbench/route.ts");
const workbench = read("src/app/internal/finance/finance-workbench.tsx");
const email = read("src/server/messaging/finance-email.ts");
const client = read("src/app/internal/finance/finance-client.tsx");
const page = read("src/app/internal/finance/page.tsx");
const pricing = read(
  "src/app/internal/finance/negotiated-pricing-panel.tsx",
);

for (const action of [
  "CREATE_INVOICE",
  "ISSUE_AND_EMAIL_INVOICE",
  "RECORD_PAYMENT",
  "CREATE_EXPENSE",
  "CREATE_RECURRING_EXPENSE",
]) {
  expect(route.includes(action), `Missing ${action}`);
}

for (const marker of [
  "Cashflow",
  "Invoice drafter",
  "Payments & receipts",
  "Expense tracking",
  "Subscription & recurring expenses",
  "Double-entry ledger",
  "School financial report",
]) {
  expect(workbench.includes(marker), `Missing UI ${marker}`);
}

expect(
  route.includes("INVOICE_ISSUED") &&
    route.includes("PAYMENT_RECEIVED") &&
    route.includes("EXPENSE_RECORDED"),
  "Journal automation incomplete",
);

expect(
  email.includes("sendFinanceInvoiceEmail") &&
    email.includes("sendFinanceReceiptEmail"),
  "Finance email renderer incomplete",
);

expect(page.includes("FinanceWorkbench"), "FinanceWorkbench not wired");

const badC3 = String.fromCharCode(0x00c3);
const badC2 = String.fromCharCode(0x00c2);

for (const source of [route, workbench, email, client, pricing, page]) {
  expect(
    !source.includes(badC3) && !source.includes(badC2),
    "Finance mojibake marker remains",
  );
}

console.log("M64_FINANCE_OPERATIONS_UI=GREEN");
console.log("CASHFLOW_UI=GREEN");
console.log("INVOICE_DRAFTER_EMAIL_UI=GREEN");
console.log("PAYMENT_RECEIPT_UI=GREEN");
console.log("EXPENSE_TRACKING_UI=GREEN");
console.log("SUBSCRIPTION_RECURRING_UI=GREEN");
console.log("LEDGER_UI=GREEN");
console.log("FINANCIAL_REPORT_UI=GREEN");
console.log("FINANCE_MOJIBAKE_GUARD=GREEN");