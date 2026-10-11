"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Agreement = {
  id: string;
  school_name: string;
  status: "DRAFT" | "AGREED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  service_session_label: string | null;
  ends_on: string;
  agreed_total_kobo: string | number;
  invoice_count: number;
};

type CommercialSnapshot = {
  agreements: Agreement[];
};

type Invoice = {
  id: string;
  school_name: string;
  status: string;
  display_status: string;
  subtotal_kobo: string | number;
  total_kobo: string | number;
  balance_kobo: string | number;
};

type SchoolReport = {
  school_id: string;
  school_name: string;
  invoiced_kobo: string | number;
  collected_kobo: string | number;
  outstanding_kobo: string | number;
};

type WorkbenchSnapshot = {
  invoices: Invoice[];
  schoolReport: SchoolReport[];
  summary: {
    invoicedKobo: number;
    collectedKobo: number;
    expensesKobo: number;
    outstandingKobo: number;
    taxOnIssuedKobo: number;
    netCashflowKobo: number;
  };
};

function moneyKobo(value: number | string) {
  return `NGN ${new Intl.NumberFormat("en-NG", {
    maximumFractionDigits: 0,
  }).format(Number(value) / 100)}`;
}

function percentage(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.min(Math.max((numerator / denominator) * 100, 0), 100);
}

function Bar({
  label,
  value,
  max,
  detail,
}: {
  label: string;
  value: number;
  max: number;
  detail?: string;
}) {
  const width = max <= 0 ? 0 : Math.max((value / max) * 100, value > 0 ? 2 : 0);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{label}</p>
          {detail ? (
            <p className="mt-1 text-[10px] leading-4 text-black/40">{detail}</p>
          ) : null}
        </div>
        <p className="font-mono text-xs font-semibold">{moneyKobo(value)}</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden bg-black/10">
        <div className="h-full bg-black" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function FinanceOverview() {
  const [commercial, setCommercial] = useState<CommercialSnapshot | null>(null);
  const [workbench, setWorkbench] = useState<WorkbenchSnapshot | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchOverview = useCallback(async (): Promise<
    [CommercialSnapshot, WorkbenchSnapshot]
  > => {
    const [commercialResponse, workbenchResponse] = await Promise.all([
      fetch("/api/internal/finance/commercial-model", { cache: "no-store" }),
      fetch("/api/internal/finance/workbench", { cache: "no-store" }),
    ]);

    const commercialBody = (await commercialResponse
      .json()
      .catch(() => ({}))) as CommercialSnapshot | { message?: string };
    const workbenchBody = (await workbenchResponse
      .json()
      .catch(() => ({}))) as WorkbenchSnapshot | { message?: string };

    if (!commercialResponse.ok || !("agreements" in commercialBody)) {
      throw new Error(
        "message" in commercialBody && commercialBody.message
          ? commercialBody.message
          : "Could not load session agreements.",
      );
    }

    if (!workbenchResponse.ok || !("summary" in workbenchBody)) {
      throw new Error(
        "message" in workbenchBody && workbenchBody.message
          ? workbenchBody.message
          : "Could not load Finance performance.",
      );
    }

    return [commercialBody, workbenchBody];
  }, []);

  const refreshOverview = useCallback(async () => {
    setRefreshing(true);
    setError("");

    try {
      const [commercialBody, workbenchBody] = await fetchOverview();
      setCommercial(commercialBody);
      setWorkbench(workbenchBody);
    } finally {
      setRefreshing(false);
    }
  }, [fetchOverview]);

  useEffect(() => {
    let cancelled = false;

    void fetchOverview()
      .then(([commercialBody, workbenchBody]) => {
        if (cancelled) return;
        setCommercial(commercialBody);
        setWorkbench(workbenchBody);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load Finance overview.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchOverview]);

  const analysis = useMemo(() => {
    if (!commercial || !workbench) return null;

    const liveAgreements = commercial.agreements.filter((agreement) =>
      ["AGREED", "ACTIVE", "COMPLETED"].includes(agreement.status),
    );
    const draftAgreements = commercial.agreements.filter(
      (agreement) => agreement.status === "DRAFT",
    );
    const agreedSessionKobo = liveAgreements.reduce(
      (sum, agreement) => sum + Number(agreement.agreed_total_kobo),
      0,
    );
    const unbilledAgreements = liveAgreements.filter(
      (agreement) => Number(agreement.invoice_count ?? 0) === 0,
    );
    const issuedInvoices = workbench.invoices.filter(
      (invoice) => !["DRAFT", "VOID"].includes(invoice.status),
    );
    const draftInvoices = workbench.invoices.filter(
      (invoice) => invoice.status === "DRAFT",
    );
    const paidInvoices = workbench.invoices.filter(
      (invoice) => invoice.status === "PAID",
    );
    const overdueInvoices = workbench.invoices.filter(
      (invoice) => invoice.display_status === "OVERDUE",
    );
    const maxCommercial = Math.max(
      agreedSessionKobo,
      workbench.summary.invoicedKobo,
      workbench.summary.collectedKobo,
      1,
    );
    const maxCash = Math.max(
      workbench.summary.collectedKobo,
      workbench.summary.expensesKobo,
      Math.abs(workbench.summary.netCashflowKobo),
      1,
    );

    const schoolContribution = [...workbench.schoolReport]
      .sort(
        (left, right) =>
          Number(right.invoiced_kobo) - Number(left.invoiced_kobo),
      )
      .slice(0, 6);
    const maxSchool = Math.max(
      ...schoolContribution.map((item) => Number(item.invoiced_kobo)),
      1,
    );

    return {
      liveAgreements,
      draftAgreements,
      agreedSessionKobo,
      unbilledAgreements,
      issuedInvoices,
      draftInvoices,
      paidInvoices,
      overdueInvoices,
      maxCommercial,
      maxCash,
      schoolContribution,
      maxSchool,
      collectionRate: percentage(
        workbench.summary.collectedKobo,
        workbench.summary.invoicedKobo,
      ),
    };
  }, [commercial, workbench]);

  if (!commercial || !workbench || !analysis) {
    return (
      <section className="border-b border-black/15 bg-white px-5 py-8 sm:px-8 lg:px-10">
        <p className="text-sm text-black/50">
          {error || "Loading Finance overview..."}
        </p>
      </section>
    );
  }

  return (
    <section className="border-b border-black/15 bg-[#f2f2ef] px-5 py-7 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="casa-kicker text-black/40">Finance overview</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
            Commercial effort to cash.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
            A compact view of what CASA has agreed, invoiced, collected, spent
            and still needs to follow up.
          </p>
        </div>
        <button
          className="casa-button text-xs"
          disabled={refreshing}
          onClick={() =>
            void refreshOverview().catch((caught) =>
              setError(
                caught instanceof Error ? caught.message : "Refresh failed.",
              ),
            )
          }
          type="button"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 border border-[#7e1d18]/30 bg-[#f6e8e6] px-4 py-3 text-sm text-[#7e1d18]">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Agreed session value", analysis.agreedSessionKobo],
          ["Issued invoice value", workbench.summary.invoicedKobo],
          ["Cash collected", workbench.summary.collectedKobo],
          ["Outstanding", workbench.summary.outstandingKobo],
          ["Operating expenses", workbench.summary.expensesKobo],
          ["Net cashflow", workbench.summary.netCashflowKobo],
        ].map(([label, value]) => (
          <article className="border border-black bg-white p-4" key={String(label)}>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/45">
              {String(label)}
            </p>
            <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
              {moneyKobo(Number(value))}
            </p>
          </article>
        ))}
      </div>

      <section className="mt-5 border border-black bg-white">
        <div className="border-b border-black p-5">
          <p className="casa-kicker text-black/40">Commercial flow</p>
          <h3 className="mt-2 text-xl font-semibold">
            Agreement → invoice → collection
          </h3>
        </div>
        <div className="grid gap-0 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          {[
            [
              "Agreed sessions",
              String(analysis.liveAgreements.length),
              moneyKobo(analysis.agreedSessionKobo),
            ],
            [
              "Invoice schedules",
              String(
                commercial.agreements.filter(
                  (agreement) => Number(agreement.invoice_count ?? 0) > 0,
                ).length,
              ),
              `${analysis.draftInvoices.length} draft invoice(s)`,
            ],
            [
              "Issued",
              String(analysis.issuedInvoices.length),
              moneyKobo(workbench.summary.invoicedKobo),
            ],
            [
              "Collected",
              String(analysis.paidInvoices.length),
              `${analysis.collectionRate.toFixed(0)}% collection rate`,
            ],
          ].map(([label, count, detail], index) => (
            <div className="contents" key={String(label)}>
              <article className="p-5">
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-black/40">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-semibold">{count}</p>
                <p className="mt-2 text-xs text-black/45">{detail}</p>
              </article>
              {index < 3 ? (
                <div className="hidden items-center px-2 text-2xl text-black/25 md:flex">
                  →
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">Commercial conversion</p>
          <h3 className="mt-2 text-xl font-semibold">Agreed → invoiced → cash</h3>
          <div className="mt-6 space-y-5">
            <Bar
              label="Agreed session value"
              value={analysis.agreedSessionKobo}
              max={analysis.maxCommercial}
              detail="Frozen school agreement totals before VAT."
            />
            <Bar
              label="Issued invoice value"
              value={workbench.summary.invoicedKobo}
              max={analysis.maxCommercial}
              detail="Issued invoices include VAT where VAT was entered."
            />
            <Bar
              label="Cash collected"
              value={workbench.summary.collectedKobo}
              max={analysis.maxCommercial}
              detail={`${analysis.collectionRate.toFixed(0)}% of issued invoice value collected.`}
            />
          </div>
        </section>

        <section className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">Cash effort</p>
          <h3 className="mt-2 text-xl font-semibold">Collection vs operating cost</h3>
          <div className="mt-6 space-y-5">
            <Bar
              label="Cash collected"
              value={workbench.summary.collectedKobo}
              max={analysis.maxCash}
            />
            <Bar
              label="Operating expenses"
              value={workbench.summary.expensesKobo}
              max={analysis.maxCash}
            />
            <Bar
              label="Net cashflow"
              value={Math.max(workbench.summary.netCashflowKobo, 0)}
              max={analysis.maxCash}
              detail={
                workbench.summary.netCashflowKobo < 0
                  ? `Negative by ${moneyKobo(Math.abs(workbench.summary.netCashflowKobo))}`
                  : "Collected cash less recorded operating expenses."
              }
            />
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">School contribution</p>
          <h3 className="mt-2 text-xl font-semibold">Issued value by school</h3>
          <div className="mt-5 space-y-4">
            {analysis.schoolContribution.length === 0 ? (
              <p className="text-sm text-black/45">No issued school invoices yet.</p>
            ) : (
              analysis.schoolContribution.map((school) => (
                <Bar
                  key={school.school_id}
                  label={school.school_name}
                  value={Number(school.invoiced_kobo)}
                  max={analysis.maxSchool}
                  detail={`Collected ${moneyKobo(school.collected_kobo)} · Outstanding ${moneyKobo(school.outstanding_kobo)}`}
                />
              ))
            )}
          </div>
        </section>

        <section className="border border-black bg-white">
          <div className="border-b border-black p-5">
            <p className="casa-kicker text-black/40">Attention</p>
            <h3 className="mt-2 text-xl font-semibold">What needs action</h3>
          </div>
          <div className="divide-y divide-black/10">
            {[
              [
                "Draft agreements",
                analysis.draftAgreements.length,
                "Commercial terms still need agreement.",
              ],
              [
                "Agreed but not invoiced",
                analysis.unbilledAgreements.length,
                "Create the agreed invoice schedule.",
              ],
              [
                "Overdue invoices",
                analysis.overdueInvoices.length,
                "Collection follow-up is required.",
              ],
              [
                "Draft invoices awaiting issue",
                analysis.draftInvoices.length,
                "Review and issue them when the school billing schedule is ready.",
              ],
            ].map(([label, count, detail]) => (
              <div className="flex items-start justify-between gap-4 p-4" key={String(label)}>
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-black/45">{detail}</p>
                </div>
                <span className="font-mono text-xl font-semibold">{count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
