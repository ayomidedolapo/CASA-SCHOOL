"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type School = { id: string; name: string; slug: string };
type Budget = {
  id: string;
  school_id: string | null;
  school_name: string | null;
  name: string;
  period_kind: string;
  starts_on: string;
  ends_on: string;
  status: string;
  notes: string | null;
  planned_kobo: string | number;
  budgeted_actual_kobo: string | number;
  unbudgeted_actual_kobo: string | number;
  total_actual_kobo: string | number;
};
type BudgetLine = {
  id: string;
  budget_id: string;
  category: string;
  planned_kobo: string | number;
  actual_kobo: string | number;
  notes: string | null;
};
type UnbudgetedCategory = {
  budget_id: string;
  category: string;
  actual_kobo: string | number;
};
type ReminderPolicy = {
  school_id: string;
  school_name: string;
  is_saved: boolean;
  is_enabled: boolean;
  before_due_days: number;
  overdue_every_days: number;
  max_overdue_reminders: number;
};
type Reminder = {
  id: string;
  invoice_id: string;
  school_id: string;
  school_name: string;
  invoice_number: string;
  reminder_kind: string;
  scheduled_for: string;
  recipient_email: string;
  status: string;
  attempt_count: number;
  sent_at: string | null;
  last_error: string | null;
};
type CalendarEvent = {
  id: string;
  source_kind: string;
  school_id: string | null;
  school_name: string | null;
  title: string;
  event_type: string;
  event_date: string;
  amount_kobo: string | number | null;
  description: string;
  speech_text: string;
  status: string;
};
type Snapshot = {
  month: string;
  monthStart: string;
  monthEnd: string;
  schools: School[];
  budgets: Budget[];
  budgetLines: BudgetLine[];
  unbudgetedCategories: UnbudgetedCategory[];
  reminderPolicies: ReminderPolicy[];
  reminders: Reminder[];
  calendarEvents: CalendarEvent[];
};
type Tab = "BUDGETS" | "REMINDERS" | "CALENDAR";

function money(value: string | number | null) {
  if (value === null) return "-";
  return `NGN ${new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) / 100)}`;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-NG", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthCells(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leading = first.getUTCDay();
  const cells: Array<string | null> = [];

  for (let index = 0; index < leading; index += 1) cells.push(null);

  for (let day = 1; day <= days; day += 1) {
    cells.push(
      `${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
  }

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function FinanceIntelligence() {
  const [tab, setTab] = useState<Tab>("BUDGETS");
  const [month, setMonth] = useState(currentMonth());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [budgetName, setBudgetName] = useState("");
  const [budgetSchoolId, setBudgetSchoolId] = useState("");
  const [budgetKind, setBudgetKind] = useState("MONTHLY");
  const [budgetStart, setBudgetStart] = useState(today().slice(0, 8) + "01");
  const [budgetEnd, setBudgetEnd] = useState(today());
  const [budgetNotes, setBudgetNotes] = useState("");
  const [budgetLines, setBudgetLines] = useState([
    { category: "Cloud infrastructure", amount: "" },
  ]);

  const [policySchoolId, setPolicySchoolId] = useState("");
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [beforeDueDays, setBeforeDueDays] = useState("3");
  const [overdueEveryDays, setOverdueEveryDays] = useState("3");
  const [maxOverdue, setMaxOverdue] = useState("5");

  const [eventSchoolId, setEventSchoolId] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventType, setEventType] = useState("OTHER");
  const [eventDate, setEventDate] = useState(today());
  const [eventAmount, setEventAmount] = useState("");
  const [eventDescription, setEventDescription] = useState("");
  const [eventSpeech, setEventSpeech] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const applyPolicySchool = useCallback(
    (schoolId: string, sourceSnapshot: Snapshot | null) => {
      setPolicySchoolId(schoolId);

      const policy = sourceSnapshot?.reminderPolicies.find(
        (item) => item.school_id === schoolId,
      );

      if (!policy) {
        setPolicyEnabled(true);
        setBeforeDueDays("3");
        setOverdueEveryDays("3");
        setMaxOverdue("5");
        return;
      }

      setPolicyEnabled(policy.is_enabled);
      setBeforeDueDays(String(policy.before_due_days));
      setOverdueEveryDays(String(policy.overdue_every_days));
      setMaxOverdue(String(policy.max_overdue_reminders));
    },
    [],
  );
  const load = useCallback(async () => {
    const response = await fetch(
      `/api/internal/finance/intelligence?month=${encodeURIComponent(month)}`,
      { cache: "no-store" },
    );
    const body = (await response.json().catch(() => ({}))) as
      | Snapshot
      | { message?: string };

    if (!response.ok || !("budgets" in body)) {
      throw new Error(
        "message" in body && typeof body.message === "string"
          ? body.message
          : "Could not load Finance planning.",
      );
    }

    setSnapshot(body);

    if (!policySchoolId && body.schools[0]) {
      applyPolicySchool(body.schools[0].id, body);
    }
  }, [month, policySchoolId, applyPolicySchool]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(
          `/api/internal/finance/intelligence?month=${encodeURIComponent(month)}`,
          { cache: "no-store" },
        );
        const body = (await response.json().catch(() => ({}))) as
          | Snapshot
          | { message?: string };

        if (cancelled) return;

        if (!response.ok || !("budgets" in body)) {
          throw new Error(
            "message" in body && typeof body.message === "string"
              ? body.message
              : "Could not load Finance planning.",
          );
        }

        setSnapshot(body);
        if (body.schools[0]) {
          applyPolicySchool(body.schools[0].id, body);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load Finance planning.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [month, applyPolicySchool]);



  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    setError("");

    try {
      const response = await fetch("/api/internal/finance/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        [key: string]: unknown;
      };

      if (!response.ok) {
        throw new Error(result.message ?? "Finance planning operation failed.");
      }

      await load();
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function createBudget(event: FormEvent) {
    event.preventDefault();
    try {
      await post({
        action: "CREATE_BUDGET",
        schoolId: budgetSchoolId || null,
        name: budgetName,
        periodKind: budgetKind,
        startsOn: budgetStart,
        endsOn: budgetEnd,
        notes: budgetNotes.trim() || null,
        lines: budgetLines
          .filter((line) => line.category.trim() && line.amount !== "")
          .map((line) => ({
            category: line.category,
            plannedNaira: Number(line.amount),
          })),
      });
      setNotice("Budget created. Actual spending will update automatically.");
      setBudgetName("");
      setBudgetNotes("");
      setBudgetLines([{ category: "Cloud infrastructure", amount: "" }]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Budget creation failed.",
      );
    }
  }

  async function savePolicy(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await post({
        action: "SET_REMINDER_POLICY",
        schoolId: policySchoolId,
        isEnabled: policyEnabled,
        beforeDueDays: Number(beforeDueDays),
        overdueEveryDays: Number(overdueEveryDays),
        maxOverdueReminders: Number(maxOverdue),
      });
      setNotice(
        result.auditLogged === false
          ? "Automatic payment reminder policy saved and active. Internal audit logging reported a warning."
          : "Automatic payment reminder policy saved and active.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Reminder policy failed.",
      );
    }
  }

  async function runReminderScan() {
    try {
      const result = await post({ action: "RUN_REMINDER_SCAN" });
      setNotice(
        `Reminder scan complete. New due reminders ${String(
          result.reconciled ?? 0,
        )}, processed ${String(result.claimed ?? 0)}, sent ${String(
          result.sent ?? 0,
        )}, retrying ${String(result.retried ?? 0)}, failed ${String(
          result.failed ?? 0,
        )}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Reminder scan failed.",
      );
    }
  }

  async function createCalendarEvent(event: FormEvent) {
    event.preventDefault();
    try {
      await post({
        action: "CREATE_CALENDAR_EVENT",
        schoolId: eventSchoolId || null,
        title: eventTitle,
        eventType,
        eventDate,
        amountNaira: eventAmount === "" ? null : Number(eventAmount),
        description: eventDescription,
        speechText: eventSpeech.trim() || null,
      });
      setNotice("Financial calendar event created.");
      setEventTitle("");
      setEventAmount("");
      setEventDescription("");
      setEventSpeech("");
      setMonth(eventDate.slice(0, 7));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Calendar event failed.",
      );
    }
  }

  async function completeSelectedEvent() {
    if (!selectedEvent || selectedEvent.source_kind !== "MANUAL") return;
    try {
      await post({
        action: "SET_CALENDAR_EVENT_STATUS",
        eventId: selectedEvent.id,
        status: "COMPLETED",
      });
      setSelectedEvent(null);
      setNotice("Financial calendar event completed.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Calendar update failed.",
      );
    }
  }

  const intelligenceQuery=search.trim().toLowerCase();
  const intelligenceHas=(...values:Array<string|number|null|undefined>)=>!intelligenceQuery||values.some(value=>String(value??"").toLowerCase().includes(intelligenceQuery));
  const filteredBudgets=(snapshot?.budgets??[]).filter((budget)=>{
    const budgetCategories=(snapshot?.budgetLines??[]).filter((line)=>line.budget_id===budget.id).map((line)=>line.category).join(" ");
    const unbudgeted=(snapshot?.unbudgetedCategories??[]).filter((item)=>item.budget_id===budget.id).map((item)=>item.category).join(" ");
    return intelligenceHas(
      budget.name,
      budget.school_name,
      budget.period_kind,
      budget.starts_on,
      budget.ends_on,
      budget.status,
      budget.notes,
      budgetCategories,
      unbudgeted,
      money(budget.planned_kobo),
      money(budget.budgeted_actual_kobo),
      money(budget.unbudgeted_actual_kobo),
      money(budget.total_actual_kobo),
    );
  });
  const filteredPolicies=(snapshot?.reminderPolicies??[]).filter(policy=>intelligenceHas(policy.school_name,policy.is_saved?"saved":"default",policy.is_enabled?"enabled":"paused",policy.before_due_days,policy.overdue_every_days,policy.max_overdue_reminders));
  const filteredReminders=(snapshot?.reminders??[]).filter(reminder=>intelligenceHas(reminder.school_name,reminder.invoice_number,reminder.reminder_kind,reminder.scheduled_for,reminder.recipient_email,reminder.status,reminder.last_error,reminder.attempt_count));

  const cells = monthCells(month);
  const grouped = new Map<string, CalendarEvent[]>();

  for (const item of snapshot?.calendarEvents ?? []) {
    const list = grouped.get(item.event_date) ?? [];
    list.push(item);
    grouped.set(item.event_date, list);
  }

  return (
    <section className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="casa-kicker text-black/40">M65 / Planning & automation</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
            Finance intelligence.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
            Plan budgets, automate invoice reminders, and see financial events
            in a single operational calendar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["BUDGETS", "Budgeting"],
            ["REMINDERS", "Payment reminders"],
            ["CALENDAR", "Financial calendar"],
          ] as Array<[Tab, string]>).map(([key, label]) => (
            <button
              className={`border px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] ${
                tab === key
                  ? "border-black bg-black text-white"
                  : "border-black/20 bg-white"
              }`}
              key={key}
              onClick={() => {
                setTab(key);
                setSearch("");
                setNotice("");
                setError("");
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {notice ? (
        <div className="mt-4 border border-[#145a3b]/30 bg-[#eaf4ed] px-4 py-3 text-sm text-[#145a3b]">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 border border-[#7e1d18]/30 bg-[#f6e8e6] px-4 py-3 text-sm text-[#7e1d18]">
          {error}
        </div>
      ) : null}

      {!snapshot ? (
        <p className="mt-6 text-sm text-black/45">Loading Finance planning...</p>
      ) : null}

      {snapshot && tab !== "CALENDAR" ? (
        <label className="casa-label mt-5 block border border-black/15 bg-black/[0.02] p-4">
          <span>Search this list</span>
          <input
            className="casa-field"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tab === "BUDGETS" ? "Budget name, school, period, status..." : "School, invoice, reminder status, email..."}
          />
        </label>
      ) : null}

      {snapshot && tab === "BUDGETS" ? (
        <div className="mt-6 grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
          <form className="border border-black p-5" onSubmit={createBudget}>
            <p className="casa-kicker text-black/40">Budget builder</p>
            <h3 className="mt-2 text-2xl font-semibold">Create budget</h3>

            <label className="casa-label mt-5">
              <span>Name</span>
              <input
                className="casa-field"
                value={budgetName}
                onChange={(event) => setBudgetName(event.target.value)}
                placeholder="e.g. Q4 operating budget"
                required
              />
            </label>

            <label className="casa-label mt-4">
              <span>Applies to</span>
              <select
                className="casa-field"
                value={budgetSchoolId}
                onChange={(event) => setBudgetSchoolId(event.target.value)}
              >
                <option value="">CASA-wide</option>
                {snapshot.schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 text-[10px] normal-case tracking-normal text-black/40">CASA-wide is for the general CASA operating budget. Choose a school only when the budget belongs specifically to that school.</span>
            </label>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="casa-label">
                <span>Period</span>
                <select
                  className="casa-field"
                  value={budgetKind}
                  onChange={(event) => setBudgetKind(event.target.value)}
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUAL">Annual</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </label>
              <div />
              <label className="casa-label">
                <span>Starts</span>
                <input
                  className="casa-field"
                  type="date"
                  value={budgetStart}
                  onChange={(event) => setBudgetStart(event.target.value)}
                  required
                />
              </label>
              <label className="casa-label">
                <span>Ends</span>
                <input
                  className="casa-field"
                  type="date"
                  value={budgetEnd}
                  onChange={(event) => setBudgetEnd(event.target.value)}
                  required
                />
              </label>
            </div>

            <div className="mt-5 border-t border-black/15 pt-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Budget categories</p>
                <button
                  className="casa-button text-xs"
                  onClick={() =>
                    setBudgetLines([
                      ...budgetLines,
                      { category: "", amount: "" },
                    ])
                  }
                  type="button"
                >
                  Add category
                </button>
              </div>

              <p className="mt-2 text-[10px] leading-4 text-black/45">
                Expense records are matched to these categories automatically. Use the same category name when recording an expense.
              </p>
              <div className="mt-3 grid gap-3">
                {budgetLines.map((line, index) => (
                  <div
                    className="grid gap-2 sm:grid-cols-[1fr_140px_auto]"
                    key={index}
                  >
                    <input
                      className="casa-field"
                      value={line.category}
                      onChange={(event) =>
                        setBudgetLines(
                          budgetLines.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, category: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="Category"
                    />
                    <input
                      className="casa-field"
                      min="0"
                      step="0.01"
                      type="number"
                      value={line.amount}
                      onChange={(event) =>
                        setBudgetLines(
                          budgetLines.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="NGN"
                    />
                    <button
                      className="casa-button text-xs"
                      disabled={budgetLines.length === 1}
                      onClick={() =>
                        setBudgetLines(
                          budgetLines.filter(
                            (_item, itemIndex) => itemIndex !== index,
                          ),
                        )
                      }
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <label className="casa-label mt-4">
              <span>Notes</span>
              <textarea
                className="casa-field min-h-24"
                value={budgetNotes}
                onChange={(event) => setBudgetNotes(event.target.value)}
              />
            </label>

            <button className="casa-button-primary mt-5" disabled={busy}>
              {busy ? "Saving..." : "Create budget"}
            </button>
          </form>

          <section className="border border-black">
            <div className="border-b border-black p-5">
              <p className="casa-kicker text-black/40">Budget variance</p>
              <h3 className="mt-2 text-2xl font-semibold">
                Planned versus actual
              </h3>
            </div>
            <div className="divide-y divide-black/10">
              {filteredBudgets.map((budget) => {
                const planned=Number(budget.planned_kobo);
                const budgetedActual=Number(budget.budgeted_actual_kobo);
                const unbudgetedActual=Number(budget.unbudgeted_actual_kobo);
                const totalActual=Number(budget.total_actual_kobo);
                const remaining=planned-budgetedActual;
                const used=planned>0?Math.round((budgetedActual/planned)*100):0;
                const lines=snapshot.budgetLines.filter((line)=>line.budget_id===budget.id);
                const unbudgeted=snapshot.unbudgetedCategories.filter((item)=>item.budget_id===budget.id);

                return (
                  <article className="p-5" key={budget.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold">{budget.name}</p>
                        <p className="mt-1 font-mono text-[9px] uppercase text-black/40">
                          {budget.school_name ?? "CASA-wide"} -{" "}
                          {budget.starts_on} to {budget.ends_on}
                        </p>
                      </div>
                      <p className="font-mono text-xs font-semibold">
                        {used}% of planned budget used
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-[10px] uppercase text-black/40">Planned</p>
                        <p className="mt-1 font-semibold">{money(planned)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-black/40">Budgeted spend</p>
                        <p className="mt-1 font-semibold">{money(budgetedActual)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-black/40">Unbudgeted spend</p>
                        <p className="mt-1 font-semibold">{money(unbudgetedActual)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-black/40">Total spending</p>
                        <p className="mt-1 font-semibold">{money(totalActual)}</p>
                      </div>
                    </div>

                    <div className="mt-4 border border-black/10 bg-black/[0.02] p-3">
                      <p className="text-[10px] uppercase text-black/40">
                        {remaining>=0?"Remaining planned":"Over budget"}
                      </p>
                      <p className="mt-1 font-semibold">{money(Math.abs(remaining))}</p>
                      <p className="mt-1 text-[10px] leading-4 text-black/45">
                        Only expenses that match a budget category reduce that category balance. Other expenses are shown separately as unbudgeted spend.
                      </p>
                    </div>

                    <div className="mt-5 border-t border-black/15 pt-4">
                      <p className="text-sm font-semibold">Category breakdown</p>
                      <p className="mt-1 text-[10px] leading-4 text-black/45">
                        Expense categories match budget categories case-insensitively and ignore leading or trailing spaces.
                      </p>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-xs">
                          <thead className="border-y border-black/15 font-mono text-[9px] uppercase text-black/45">
                            <tr>
                              <th className="py-2 pr-3">Category</th>
                              <th className="py-2 px-3 text-right">Planned</th>
                              <th className="py-2 px-3 text-right">Actual</th>
                              <th className="py-2 px-3 text-right">Remaining</th>
                              <th className="py-2 pl-3 text-right">Used</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/10">
                            {lines.map((line)=>{
                              const linePlanned=Number(line.planned_kobo);
                              const lineActual=Number(line.actual_kobo);
                              const lineRemaining=linePlanned-lineActual;
                              const lineUsed=linePlanned>0?Math.round((lineActual/linePlanned)*100):0;
                              return (
                                <tr key={line.id}>
                                  <td className="py-3 pr-3 font-medium">{line.category}</td>
                                  <td className="py-3 px-3 text-right font-mono">{money(linePlanned)}</td>
                                  <td className="py-3 px-3 text-right font-mono">{money(lineActual)}</td>
                                  <td className="py-3 px-3 text-right font-mono">{lineRemaining>=0?money(lineRemaining):`Over ${money(Math.abs(lineRemaining))}`}</td>
                                  <td className="py-3 pl-3 text-right font-mono">{lineUsed}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {unbudgeted.length>0?(
                      <div className="mt-5 border border-black/15 p-4">
                        <p className="text-sm font-semibold">Unbudgeted expenses</p>
                        <p className="mt-1 text-[10px] leading-4 text-black/45">
                          These expenses occurred during this budget period but do not match any planned category.
                        </p>
                        <div className="mt-3 grid gap-2">
                          {unbudgeted.map((item)=>(
                            <div className="flex items-center justify-between gap-4 text-xs" key={`${budget.id}-${item.category}`}>
                              <span>{item.category}</span>
                              <span className="font-mono font-semibold">{money(item.actual_kobo)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ):null}
                  </article>
                );
              })}
              {filteredBudgets.length === 0 ? (
                <p className="p-5 text-sm text-black/45">
                  {intelligenceQuery ? "No matching budgets." : "No budgets created yet."}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {snapshot && tab === "REMINDERS" ? (
        <div className="mt-6 grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
          <form className="border border-black p-5" onSubmit={savePolicy}>
            <p className="casa-kicker text-black/40">Automation policy</p>
            <h3 className="mt-2 text-2xl font-semibold">
              Automatic payment reminders
            </h3>
            <p className="mt-2 text-xs leading-5 text-black/45">
              CASA uses the existing background scheduler. No separate Finance
              scheduler is required.
            </p>

            <label className="casa-label mt-5">
              <span>School</span>
              <select
                className="casa-field"
                value={policySchoolId}
                onChange={(event) => applyPolicySchool(event.target.value, snapshot)}
              >
                {snapshot.schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 flex items-center gap-3 border border-black/15 p-4 text-sm">
              <input
                checked={policyEnabled}
                onChange={(event) => setPolicyEnabled(event.target.checked)}
                type="checkbox"
              />
              Enable automatic reminders for this school
            </label>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="casa-label">
                <span>Days before due</span>
                <input
                  className="casa-field"
                  min="0"
                  max="30"
                  step="1"
                  type="number"
                  value={beforeDueDays}
                  onChange={(event) => setBeforeDueDays(event.target.value)}
                />
              </label>
              <label className="casa-label">
                <span>Overdue interval</span>
                <input
                  className="casa-field"
                  min="1"
                  max="30"
                  step="1"
                  type="number"
                  value={overdueEveryDays}
                  onChange={(event) => setOverdueEveryDays(event.target.value)}
                />
              </label>
              <label className="casa-label">
                <span>Maximum overdue reminders</span>
                <input
                  className="casa-field"
                  min="1"
                  max="20"
                  step="1"
                  type="number"
                  value={maxOverdue}
                  onChange={(event) => setMaxOverdue(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button className="casa-button-primary" disabled={busy}>
                {busy ? "Saving..." : "Save reminder policy"}
              </button>
              <button
                className="casa-button"
                disabled={busy}
                onClick={() => void runReminderScan()}
                type="button"
              >
                Run scan now
              </button>
            </div>

            <p className="mt-4 text-[10px] leading-4 text-black/45">
              Saving a policy stores the rules for the selected school. It does
              not create a delivery-history row by itself. A delivery appears
              only when an eligible unpaid invoice reaches a reminder date.
            </p>
          </form>

          <div className="grid content-start gap-5">
            <section className="border border-black">
              <div className="border-b border-black p-5">
                <p className="casa-kicker text-black/40">Policy status</p>
                <h3 className="mt-2 text-2xl font-semibold">
                  Saved reminder policies
                </h3>
                <p className="mt-2 text-xs leading-5 text-black/45">
                  This list shows the rules currently in force for each school.
                  A school marked Default is using CASA&apos;s fallback reminder
                  settings until you save a custom policy.
                </p>
              </div>
              <div className="divide-y divide-black/10">
                {filteredPolicies.map((policy) => (
                  <div className="p-4" key={policy.school_id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{policy.school_name}</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="border border-black/15 px-2 py-1 font-mono text-[9px] uppercase">
                          {policy.is_saved ? "Saved policy" : "Default policy"}
                        </span>
                        <span className="border border-black/15 px-2 py-1 font-mono text-[9px] uppercase">
                          {policy.is_enabled ? "Enabled" : "Paused"}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-black/55">
                      Reminder {policy.before_due_days} day
                      {policy.before_due_days === 1 ? "" : "s"} before due;
                      then every {policy.overdue_every_days} day
                      {policy.overdue_every_days === 1 ? "" : "s"} overdue;
                      maximum {policy.max_overdue_reminders} overdue reminder
                      {policy.max_overdue_reminders === 1 ? "" : "s"}.
                    </p>
                    {!policy.is_saved ? (
                      <p className="mt-1 text-[10px] leading-4 text-black/40">
                        Save a policy for this school to replace the default
                        settings.
                      </p>
                    ) : null}
                  </div>
                ))}
                {filteredPolicies.length === 0 ? (
                  <p className="p-5 text-sm text-black/45">
                    No matching reminder policies.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="border border-black">
              <div className="border-b border-black p-5">
                <p className="casa-kicker text-black/40">Delivery history</p>
                <h3 className="mt-2 text-2xl font-semibold">
                  Reminder delivery history
                </h3>
                <p className="mt-2 text-xs leading-5 text-black/45">
                  These are actual reminder records created when invoices
                  became eligible under the saved or default policy.
                </p>
              </div>
              <div className="divide-y divide-black/10">
                {filteredReminders.map((reminder) => (
                  <div
                    className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]"
                    key={reminder.id}
                  >
                    <div>
                      <p className="font-semibold">
                        {reminder.school_name} - {reminder.invoice_number}
                      </p>
                      <p className="mt-1 font-mono text-[9px] uppercase text-black/40">
                        {reminder.reminder_kind.replaceAll("_", " ")} -{" "}
                        {reminder.scheduled_for} - {reminder.status}
                      </p>
                      {reminder.last_error ? (
                        <p className="mt-2 text-xs text-[#7e1d18]">
                          {reminder.last_error}
                        </p>
                      ) : null}
                    </div>
                    <p className="font-mono text-[10px] uppercase text-black/45">
                      attempt {reminder.attempt_count}
                    </p>
                  </div>
                ))}
                {filteredReminders.length === 0 ? (
                  <p className="p-5 text-sm leading-6 text-black/45">
                    {intelligenceQuery
                      ? "No matching reminder deliveries."
                      : "No reminder deliveries yet. This does not mean the policy is missing. A delivery appears only when an unpaid issued invoice has a due date, a billing email, and reaches an eligible reminder day."}
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {snapshot && tab === "CALENDAR" ? (
        <div className="mt-6 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className="border border-black">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black p-4">
              <div>
                <p className="casa-kicker text-black/40">Financial calendar</p>
                <h3 className="mt-2 text-2xl font-semibold">
                  {monthLabel(month)}
                </h3>
              </div>
              <div className="flex gap-2">
                <button
                  className="casa-button"
                  onClick={() => setMonth(shiftMonth(month, -1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="casa-button"
                  onClick={() => setMonth(currentMonth())}
                  type="button"
                >
                  Today
                </button>
                <button
                  className="casa-button"
                  onClick={() => setMonth(shiftMonth(month, 1))}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-black/15 bg-black/[0.03]">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (label) => (
                  <div
                    className="border-r border-black/10 p-2 text-center font-mono text-[9px] uppercase text-black/45 last:border-r-0"
                    key={label}
                  >
                    {label}
                  </div>
                ),
              )}
            </div>

            <div className="grid grid-cols-7">
              {cells.map((dateValue, index) => {
                const events = dateValue ? grouped.get(dateValue) ?? [] : [];
                return (
                  <div
                    className="min-h-32 border-r border-b border-black/10 p-2 last:border-r-0"
                    key={`${dateValue ?? "blank"}-${index}`}
                  >
                    {dateValue ? (
                      <>
                        <p className="font-mono text-[9px] text-black/40">
                          {Number(dateValue.slice(-2))}
                        </p>
                        <div className="mt-2 grid gap-3">
                          {events.slice(0, 3).map((item) => (
                            <button
                              className="group flex items-start gap-2 text-left"
                              key={`${item.source_kind}-${item.id}`}
                              onClick={() => setSelectedEvent(item)}
                              type="button"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black bg-black text-[10px] font-bold text-white">
                                C
                              </span>
                              <span className="relative block rounded-2xl border border-black/20 bg-white px-3 py-2 text-[10px] leading-4 shadow-sm transition group-hover:border-black after:absolute after:-left-1 after:top-3 after:h-2 after:w-2 after:rotate-45 after:border-l after:border-b after:border-black/20 after:bg-white">
                                {item.speech_text}
                              </span>
                            </button>
                          ))}
                          {events.length > 3 ? (
                            <p className="text-[9px] text-black/40">
                              +{events.length - 3} more
                            </p>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid content-start gap-5">
            <form
              className="border border-black p-5"
              onSubmit={createCalendarEvent}
            >
              <p className="casa-kicker text-black/40">Add plan</p>
              <h3 className="mt-2 text-xl font-semibold">
                Financial calendar event
              </h3>

              <label className="casa-label mt-4">
                <span>Title</span>
                <input
                  className="casa-field"
                  value={eventTitle}
                  onChange={(event) => setEventTitle(event.target.value)}
                  required
                />
              </label>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="casa-label">
                  <span>Type</span>
                  <select
                    className="casa-field"
                    value={eventType}
                    onChange={(event) => setEventType(event.target.value)}
                  >
                    <option value="BUDGET_REVIEW">Budget review</option>
                    <option value="EXPECTED_PAYMENT">Expected payment</option>
                    <option value="EXPENSE_DUE">Expense due</option>
                    <option value="TAX">Tax</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="casa-label">
                  <span>Date</span>
                  <input
                    className="casa-field"
                    type="date"
                    value={eventDate}
                    onChange={(event) => setEventDate(event.target.value)}
                    required
                  />
                </label>
              </div>

              <label className="casa-label mt-4">
                <span>Applies to</span>
                <select
                  className="casa-field"
                  value={eventSchoolId}
                  onChange={(event) => setEventSchoolId(event.target.value)}
                >
                  <option value="">CASA-wide</option>
                  {snapshot.schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 text-[10px] normal-case tracking-normal text-black/40">CASA-wide is a general CASA finance event. Choose a school when this event is specifically about the selected school account.</span>
              </label>

              <label className="casa-label mt-4">
                <span>Amount (NGN, optional)</span>
                <input
                  className="casa-field"
                  min="0"
                  step="0.01"
                  type="number"
                  value={eventAmount}
                  onChange={(event) => setEventAmount(event.target.value)}
                />
              </label>

              <label className="casa-label mt-4">
                <span>Description</span>
                <textarea
                  className="casa-field min-h-24"
                  value={eventDescription}
                  onChange={(event) =>
                    setEventDescription(event.target.value)
                  }
                  required
                />
              </label>

              <label className="casa-label mt-4">
                <span>Speech bubble text (optional)</span>
                <input
                  className="casa-field"
                  maxLength={320}
                  value={eventSpeech}
                  onChange={(event) => setEventSpeech(event.target.value)}
                  placeholder="What should the CASA Finance Guide say?"
                />
              </label>

              <button className="casa-button-primary mt-5" disabled={busy}>
                {busy ? "Saving..." : "Add to financial calendar"}
              </button>
            </form>

            {selectedEvent ? (
              <section className="border border-black bg-[#f2f2ef] p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black bg-black text-sm font-bold text-white">
                    C
                  </span>
                  <div className="relative flex-1 rounded-2xl border border-black/20 bg-white p-4 after:absolute after:-left-2 after:top-4 after:h-4 after:w-4 after:rotate-45 after:border-l after:border-b after:border-black/20 after:bg-white">
                    <p className="font-semibold">{selectedEvent.title}</p>
                    <p className="mt-2 text-sm leading-6 text-black/60">
                      {selectedEvent.description}
                    </p>
                    <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <dt className="text-black/40">Date</dt>
                      <dd className="text-right">{selectedEvent.event_date}</dd>
                      <dt className="text-black/40">Type</dt>
                      <dd className="text-right">
                        {selectedEvent.event_type.replaceAll("_", " ")}
                      </dd>
                      <dt className="text-black/40">Amount</dt>
                      <dd className="text-right">
                        {money(selectedEvent.amount_kobo)}
                      </dd>
                      <dt className="text-black/40">Applies to</dt>
                      <dd className="text-right">
                        {selectedEvent.school_name ?? "CASA-wide"}
                      </dd>
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        className="casa-button text-xs"
                        onClick={() => setSelectedEvent(null)}
                        type="button"
                      >
                        Close
                      </button>
                      {selectedEvent.source_kind === "MANUAL" &&
                      selectedEvent.status === "PLANNED" ? (
                        <button
                          className="casa-button-primary text-xs"
                          disabled={busy}
                          onClick={() => void completeSelectedEvent()}
                          type="button"
                        >
                          Mark completed
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="border border-dashed border-black/25 p-5 text-sm text-black/45">
                Click any speech bubble on the calendar to open its full
                financial detail.
              </section>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
