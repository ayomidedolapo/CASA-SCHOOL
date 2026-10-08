import fs from "node:fs";
import path from "node:path";

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const expect = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};

const migration = read(
  "drizzle/20261008024500_m65_finance_intelligence_automation/migration.sql",
);
const route = read("src/app/api/internal/finance/intelligence/route.ts");
const ui = read("src/app/internal/finance/finance-intelligence.tsx");
const worker = read("src/server/messaging/finance-reminder-worker.ts");
const email = read("src/server/messaging/finance-email.ts");
const job = read("src/app/api/internal/jobs/guardian-push/route.ts");
const page = read("src/app/internal/finance/page.tsx");

for (const table of [
  "casa_finance_budgets",
  "casa_finance_budget_lines",
  "casa_finance_reminder_policies",
  "casa_finance_payment_reminders",
  "casa_finance_calendar_events",
]) {
  expect(migration.includes(table), `M65 migration missing ${table}`);
}

for (const action of [
  "CREATE_BUDGET",
  "SET_REMINDER_POLICY",
  "CREATE_CALENDAR_EVENT",
  "SET_CALENDAR_EVENT_STATUS",
  "RUN_REMINDER_SCAN",
]) {
  expect(route.includes(action), `M65 API missing ${action}`);
}

for (const marker of [
  "Budgeting",
  "Automatic payment reminders",
  "Financial calendar",
  "speech bubble",
  "Mark completed",
]) {
  expect(ui.includes(marker), `M65 UI missing ${marker}`);
}

expect(
  worker.includes("UPCOMING_DUE") &&
    worker.includes("OVERDUE") &&
    worker.includes("for update of reminder skip locked"),
  "M65 automatic reminder worker is incomplete",
);

expect(
  email.includes("sendFinancePaymentReminderEmail"),
  "M65 reminder email renderer is missing",
);

expect(
  job.includes("runFinancePaymentReminderWorker"),
  "Existing background job is not wired to Finance reminders",
);

expect(
  page.includes("FinanceIntelligence"),
  "Finance Intelligence UI is not wired into the Finance page",
);

const badC3 = String.fromCharCode(0x00c3);
const badC2 = String.fromCharCode(0x00c2);

for (const source of [migration, route, ui, worker, email, job, page]) {
  expect(
    !source.includes(badC3) && !source.includes(badC2),
    "M65 source contains mojibake lead characters",
  );
}

console.log("M65_FINANCE_INTELLIGENCE_SOURCE=GREEN");
console.log("BUDGETING=GREEN");
console.log("AUTOMATIC_PAYMENT_REMINDERS=GREEN");
console.log("FINANCIAL_CALENDAR=GREEN");
console.log("FINANCE_CALENDAR_SPEECH_BUBBLES=GREEN");
console.log("EXISTING_BACKGROUND_SCHEDULER_INTEGRATION=GREEN");
console.log("M65_MOJIBAKE_GUARD=GREEN");
