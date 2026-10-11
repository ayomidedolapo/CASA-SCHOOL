"use client";

import { useState } from "react";

import FinanceIntelligence from "./finance-intelligence";
import FinanceOverview from "./finance-overview";
import FinanceWorkbench from "./finance-workbench";
import SessionCommercialPanel from "./session-commercial-panel";

type Area =
  | "OVERVIEW"
  | "AGREEMENTS"
  | "BILLING"
  | "COSTS"
  | "PLANNING"
  | "ADVANCED";

const areas: Array<[Area, string, string]> = [
  ["OVERVIEW", "Overview", "Performance, flow and attention"],
  ["AGREEMENTS", "Agreements", "Session commercial terms"],
  ["BILLING", "Billing", "Invoices, collections and receipts"],
  ["COSTS", "Costs", "Expenses and recurring obligations"],
  ["PLANNING", "Planning", "Budgets and forward planning"],
  ["ADVANCED", "Advanced", "Reminders, calendar, ledger and reports"],
];

export default function FinanceHub() {
  const [area, setArea] = useState<Area>("OVERVIEW");

  return (
    <>
      <nav className="border-b border-black/15 bg-[#f2f2ef] px-5 py-4 sm:px-8 lg:px-10">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {areas.map(([key, label, description]) => (
            <button
              className={`min-w-fit border px-4 py-3 text-left transition ${
                area === key
                  ? "border-black bg-black text-white"
                  : "border-black/20 bg-white text-black hover:border-black"
              }`}
              key={key}
              onClick={() => setArea(key)}
              type="button"
            >
              <span className="block text-xs font-semibold uppercase tracking-[0.08em]">
                {label}
              </span>
              <span
                className={`mt-1 block text-[10px] ${
                  area === key ? "text-white/65" : "text-black/45"
                }`}
              >
                {description}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {area === "OVERVIEW" ? <FinanceOverview /> : null}
      {area === "AGREEMENTS" ? <SessionCommercialPanel /> : null}
      {area === "BILLING" ? (
        <FinanceWorkbench
          initialTab="INVOICES"
          visibleTabs={["INVOICES", "PAYMENTS"]}
        />
      ) : null}
      {area === "COSTS" ? (
        <FinanceWorkbench
          initialTab="EXPENSES"
          visibleTabs={["EXPENSES", "SUBSCRIPTIONS"]}
        />
      ) : null}
      {area === "PLANNING" ? (
        <FinanceIntelligence
          initialTab="BUDGETS"
          visibleTabs={["BUDGETS"]}
        />
      ) : null}
      {area === "ADVANCED" ? (
        <>
          <FinanceIntelligence
            initialTab="REMINDERS"
            visibleTabs={["REMINDERS", "CALENDAR"]}
          />
          <FinanceWorkbench
            initialTab="LEDGER"
            visibleTabs={["LEDGER", "REPORTS"]}
          />
        </>
      ) : null}
    </>
  );
}
