"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type School = {
  id: string;
  name: string;
  slug: string;
  status: string;
  student_count: number;
  current_session_name: string | null;
  current_term_name: string | null;
  session_term_count: number;
};

type Price = {
  id: string;
  fee_type: string;
  scope_kind: string;
  school_id: string | null;
  branch_id: string | null;
  amount_kobo: string | number;
  effective_from: string | Date;
};

type BillingProfile = {
  schoolId: string;
  schoolName: string;
  schoolSlug: string;
  ownerName: string | null;
  ownerEmail: string | null;
  hasSavedBillingProfile: boolean;
  billingContactName: string;
  billingEmail: string;
  billingPhone: string;
  taxIdentifier: string;
  defaultTaxLabel: string;
  defaultTaxRatePercent: number;
  invoiceDueDays: number;
  notes: string;
  effectiveInvoiceContactName: string | null;
  effectiveInvoiceEmail: string | null;
  invoiceDestinationSource:
    | "DEDICATED_BILLING_CONTACT"
    | "SCHOOL_OWNER_FALLBACK"
    | "NOT_CONFIGURED";
  usesOwnerEmailFallback: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function NegotiatedPricingPanel({
  schools,
  pricing,
}: {
  schools: School[];
  pricing: Price[];
}) {
  const router = useRouter();

  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? "");
  const [serviceFee, setServiceFee] = useState("");
  const [replacementFee, setReplacementFee] = useState("");
  const [agreementNote, setAgreementNote] = useState("");
  const [billing, setBilling] = useState<BillingProfile | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedSchool = schools.find((school) => school.id === schoolId) ?? null;

  const currentSchoolPrice = useMemo(
    () =>
      (feeType: string) => {
        const row = pricing
          .filter(
            (price) =>
              price.fee_type === feeType &&
              price.scope_kind === "SCHOOL" &&
              price.school_id === schoolId,
          )
          .sort(
            (a, b) =>
              new Date(b.effective_from).getTime() -
              new Date(a.effective_from).getTime(),
          )[0];

        return row ? Number(row.amount_kobo) / 100 : null;
      },
    [pricing, schoolId],
  );

  const globalPrice = useMemo(
    () =>
      (feeType: string) => {
        const row = pricing
          .filter(
            (price) =>
              price.fee_type === feeType &&
              price.scope_kind === "GLOBAL",
          )
          .sort(
            (a, b) =>
              new Date(b.effective_from).getTime() -
              new Date(a.effective_from).getTime(),
          )[0];

        return row ? Number(row.amount_kobo) / 100 : null;
      },
    [pricing],
  );

  useEffect(() => {
    if (!schoolId) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setError("");
      const response = await fetch(
        `/api/internal/finance/billing-profile?schoolId=${encodeURIComponent(schoolId)}`,
        { cache: "no-store" },
      );

      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        profile?: BillingProfile;
      };

      if (cancelled) return;

      if (!response.ok || !body.profile) {
        setBilling(null);
        setError(body.message ?? "Could not load the school billing profile.");
        return;
      }

      setBilling(body.profile);
    })();

    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  async function saveNegotiatedPricing(event: FormEvent) {
    event.preventDefault();
    setPricingBusy(true);
    setError("");
    setNotice("");

    try {
      if (!schoolId) {
        throw new Error("Select a school.");
      }

      const entries = [
        ["STANDARD_STUDENT", serviceFee],
        ["REPLACEMENT_CARD", replacementFee],
      ] as const;

      let writes = 0;

      for (const [feeType, value] of entries) {
        if (value === "") continue;

        const response = await fetch("/api/internal/finance/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            feeType,
            scopeKind: "SCHOOL",
            schoolId,
            amountNaira: Number(value),
            agreementNote: agreementNote.trim() || null,
          }),
        });

        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
        };

        if (!response.ok) {
          throw new Error(body.message ?? "Negotiated pricing update failed.");
        }

        writes += 1;
      }

      if (writes === 0) {
        throw new Error("Enter at least one negotiated fee.");
      }

      setServiceFee("");
      setReplacementFee("");
      setAgreementNote("");
      setNotice("Negotiated school pricing saved.");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Negotiated pricing update failed.",
      );
    } finally {
      setPricingBusy(false);
    }
  }

  async function saveBillingProfile(event: FormEvent) {
    event.preventDefault();

    if (!billing) return;

    setBillingBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/internal/finance/billing-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId,
          billingContactName: billing.billingContactName || null,
          billingEmail: billing.billingEmail || null,
          billingPhone: billing.billingPhone || null,
          taxIdentifier: billing.taxIdentifier || null,
          defaultTaxLabel: billing.defaultTaxLabel,
          defaultTaxRatePercent: Number(billing.defaultTaxRatePercent),
          invoiceDueDays: Number(billing.invoiceDueDays),
          notes: billing.notes || null,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(body.message ?? "Billing profile update failed.");
      }

      const refreshResponse = await fetch(
        `/api/internal/finance/billing-profile?schoolId=${encodeURIComponent(schoolId)}`,
        { cache: "no-store" },
      );
      const refreshBody = (await refreshResponse.json().catch(() => ({}))) as {
        message?: string;
        profile?: BillingProfile;
      };

      if (refreshResponse.ok && refreshBody.profile) {
        setBilling(refreshBody.profile);
        setNotice("School billing profile saved. Invoice destination refreshed.");
      } else {
        setNotice(
          "School billing profile saved. Refresh the page to reload the invoice destination status.",
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Billing profile update failed.",
      );
    } finally {
      setBillingBusy(false);
    }
  }

  if (schools.length === 0) {
    return (
      <section className="mt-7 border border-black bg-white p-5">
        <p className="casa-kicker text-black/40">Commercial agreements</p>
        <h2 className="mt-2 text-2xl font-semibold">
          Negotiated school pricing
        </h2>
        <p className="mt-3 text-sm text-black/50">
          Register a school before creating a negotiated CASA service rate.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-7 border border-black bg-white">
      <div className="border-b border-black p-5">
        <p className="casa-kicker text-black/40">Commercial agreements</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
          Negotiated school pricing
        </h2>
        <p className="mt-2 max-w-4xl text-xs leading-5 text-black/45">
          The CASA global rate is only a reference/fallback. A school-specific
          agreement takes precedence for estimates and future invoices. Existing
          invoices will keep their own price snapshot when invoice issuing is enabled.
        </p>
      </div>

      <div className="grid gap-0 xl:grid-cols-2">
        <form
          className="border-b border-black p-5 xl:border-r xl:border-b-0"
          onSubmit={saveNegotiatedPricing}
        >
          <label className="casa-label">
            <span>School</span>
            <select
              className="casa-field"
              value={schoolId}
              onChange={(event) => {
                setSchoolId(event.target.value);
                setNotice("");
                setError("");
              }}
            >
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </label>

          {selectedSchool ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="border border-black/15 bg-black/[0.02] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/40">
                  Service fee / student / term
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {money(
                    currentSchoolPrice("STANDARD_STUDENT") ??
                      globalPrice("STANDARD_STUDENT") ??
                      0,
                  )}
                </p>
                <p className="mt-1 text-[10px] text-black/40">
                  {currentSchoolPrice("STANDARD_STUDENT") !== null
                    ? "Negotiated school rate"
                    : "Global fallback currently applies"}
                </p>
              </div>

              <div className="border border-black/15 bg-black/[0.02] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/40">
                  Replacement card
                </p>
                <p className="mt-2 text-xl font-semibold">
                  {money(
                    currentSchoolPrice("REPLACEMENT_CARD") ??
                      globalPrice("REPLACEMENT_CARD") ??
                      0,
                  )}
                </p>
                <p className="mt-1 text-[10px] text-black/40">
                  {currentSchoolPrice("REPLACEMENT_CARD") !== null
                    ? "Negotiated school rate"
                    : "Global fallback currently applies"}
                </p>
              </div>
            </div>
          ) : null}

          <label className="casa-label mt-5">
            <span>New negotiated service fee / student / term (NGN)</span>
            <input
              className="casa-field"
              min="0"
              step="1"
              type="number"
              value={serviceFee}
              onChange={(event) => setServiceFee(event.target.value)}
              placeholder="e.g. 4000"
            />
          </label>

          <label className="casa-label mt-4">
            <span>New negotiated replacement-card fee (NGN)</span>
            <input
              className="casa-field"
              min="0"
              step="1"
              type="number"
              value={replacementFee}
              onChange={(event) => setReplacementFee(event.target.value)}
              placeholder="Leave blank if unchanged"
            />
          </label>

          <label className="casa-label mt-4">
            <span>Agreement note</span>
            <textarea
              className="casa-field min-h-28"
              value={agreementNote}
              onChange={(event) => setAgreementNote(event.target.value)}
              placeholder="e.g. Agreed with school management for 2026/2027 session."
            />
          </label>

          <button
            className="casa-button-primary mt-5"
            disabled={pricingBusy || (!serviceFee && !replacementFee)}
          >
            {pricingBusy ? "Saving..." : "Save negotiated pricing"}
          </button>
        </form>

        <form className="p-5" onSubmit={saveBillingProfile}>
          <p className="casa-kicker text-black/40">Billing profile</p>
          <h3 className="mt-2 text-xl font-semibold">Invoice destination</h3>
          <p className="mt-2 text-xs leading-5 text-black/45">
            CASA defaults to the School Owner email. Save a dedicated billing
            contact here when the school wants invoices sent elsewhere.
          </p>

          {!billing ? (
            <p className="mt-5 text-sm text-black/45">Loading billing profile...</p>
          ) : (
            <>
              <div className="mt-4 border border-black/15 bg-black/[0.02] p-4 text-xs leading-5 text-black/55">
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/40">
                  School Owner
                </p>
                <p className="mt-1 font-semibold text-black">
                  {billing.ownerName || "Not available"}
                </p>
                <p className="mt-1">
                  {billing.ownerEmail || "No owner email"}
                </p>
              </div>

              <div className="mt-4 border border-black p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/40">
                      Current invoice destination
                    </p>
                    <p className="mt-2 text-lg font-semibold">
                      {billing.effectiveInvoiceContactName || "No billing contact"}
                    </p>
                    <p className="mt-1 text-sm">
                      {billing.effectiveInvoiceEmail || "No billing email configured"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="border border-black/15 px-2 py-1 font-mono text-[9px] uppercase">
                      {billing.invoiceDestinationSource === "DEDICATED_BILLING_CONTACT"
                        ? "Dedicated billing contact"
                        : billing.invoiceDestinationSource === "SCHOOL_OWNER_FALLBACK"
                          ? "School Owner fallback"
                          : "Not configured"}
                    </span>
                    <span className="border border-black/15 px-2 py-1 font-mono text-[9px] uppercase">
                      {billing.hasSavedBillingProfile
                        ? "Billing profile saved"
                        : "Billing profile not yet saved"}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-[10px] leading-4 text-black/45">
                  {billing.invoiceDestinationSource === "DEDICATED_BILLING_CONTACT"
                    ? "New invoices will use the dedicated billing email saved below."
                    : billing.invoiceDestinationSource === "SCHOOL_OWNER_FALLBACK"
                      ? "No dedicated billing email is saved, so new invoices use the School Owner email."
                      : "CASA has no email destination for new invoices. Save a dedicated billing email below."}
                </p>
              </div>

              <p className="mt-3 text-[10px] leading-4 text-black/45">
                Changes here apply to invoices created after the billing profile is saved.
                Existing draft and issued invoices keep the destination already stored on
                those invoices.
              </p>

              <label className="casa-label mt-4">
                <span>Dedicated billing contact name</span>
                <input
                  className="casa-field"
                  value={billing.billingContactName}
                  onChange={(event) =>
                    setBilling({
                      ...billing,
                      billingContactName: event.target.value,
                    })
                  }
                />
              </label>

              <label className="casa-label mt-4">
                <span>Dedicated billing email</span>
                <input
                  className="casa-field"
                  type="email"
                  value={billing.billingEmail}
                  onChange={(event) =>
                    setBilling({
                      ...billing,
                      billingEmail: event.target.value,
                    })
                  }
                  placeholder={billing.ownerEmail || "accounts@school.com"}
                />
                <span className="mt-1 text-[10px] normal-case tracking-normal text-black/40">
                  Leave this blank to use the School Owner email as the invoice destination.
                </span>
              </label>

              <label className="casa-label mt-4">
                <span>Billing phone</span>
                <input
                  className="casa-field"
                  value={billing.billingPhone}
                  onChange={(event) =>
                    setBilling({
                      ...billing,
                      billingPhone: event.target.value,
                    })
                  }
                />
              </label>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="casa-label">
                  <span>Tax label</span>
                  <input
                    className="casa-field"
                    value={billing.defaultTaxLabel}
                    onChange={(event) =>
                      setBilling({
                        ...billing,
                        defaultTaxLabel: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="casa-label">
                  <span>Default tax rate (%)</span>
                  <input
                    className="casa-field"
                    min="0"
                    max="100"
                    step="0.01"
                    type="number"
                    value={billing.defaultTaxRatePercent}
                    onChange={(event) =>
                      setBilling({
                        ...billing,
                        defaultTaxRatePercent: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <label className="casa-label">
                  <span>Invoice due days</span>
                  <input
                    className="casa-field"
                    min="0"
                    max="365"
                    step="1"
                    type="number"
                    value={billing.invoiceDueDays}
                    onChange={(event) =>
                      setBilling({
                        ...billing,
                        invoiceDueDays: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <label className="casa-label mt-4">
                <span>Tax identifier / billing note</span>
                <input
                  className="casa-field"
                  value={billing.taxIdentifier}
                  onChange={(event) =>
                    setBilling({
                      ...billing,
                      taxIdentifier: event.target.value,
                    })
                  }
                />
              </label>

              <button className="casa-button mt-5" disabled={billingBusy}>
                {billingBusy ? "Saving..." : "Save billing profile"}
              </button>
            </>
          )}
        </form>
      </div>

      {notice ? (
        <div className="border-t border-black/15 bg-[#eaf4ed] px-5 py-3 text-sm text-[#145a3b]">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="border-t border-black/15 bg-[#f6e8e6] px-5 py-3 text-sm text-[#7e1d18]">
          {error}
        </div>
      ) : null}
    </section>
  );
}