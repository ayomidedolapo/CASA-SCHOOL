"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Defaults = {
  baseSessionFeeNaira: number;
  studentRateNaira: number;
  cardServiceFeeNaira: number;
  updatedAt: string | null;
};

type School = {
  id: string;
  name: string;
  slug: string;
  active_student_count: number;
};

type Agreement = {
  id: string;
  school_id: string;
  school_name: string;
  status: "DRAFT" | "AGREED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  service_session_label: string | null;
  starts_on: string;
  ends_on: string;
  student_count: number;
  base_session_fee_kobo: string | number;
  student_rate_kobo: string | number;
  student_component_kobo: string | number;
  card_service_fee_kobo: string | number;
  calculated_total_kobo: string | number;
  agreed_total_kobo: string | number;
  payment_plan: "FULL" | "TWO_INSTALLMENTS";
  first_installment_kobo: string | number;
  first_due_on: string;
  second_installment_kobo: string | number | null;
  second_due_on: string | null;
  agreement_note: string | null;
  invoice_count: number;
};

type Snapshot = {
  defaults: Defaults;
  schools: School[];
  agreements: Agreement[];
};

type AgreementForm = {
  agreementId: string;
  schoolId: string;
  serviceSessionLabel: string;
  startsOn: string;
  endsOn: string;
  studentCount: string;
  baseSessionFeeNaira: string;
  studentRateNaira: string;
  cardServiceFeeNaira: string;
  agreedTotalNaira: string;
  paymentPlan: "FULL" | "TWO_INSTALLMENTS";
  firstInstallmentNaira: string;
  firstDueOn: string;
  secondInstallmentNaira: string;
  secondDueOn: string;
  agreementNote: string;
};

const seedDefaults: Defaults = {
  baseSessionFeeNaira: 550000,
  studentRateNaira: 2000,
  cardServiceFeeNaira: 30000,
  updatedAt: null,
};

const today = () => new Date().toISOString().slice(0, 10);

function money(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function moneyKobo(value: string | number | null) {
  return money(Number(value ?? 0) / 100);
}

function blankAgreement(
  defaults: Defaults,
  school?: School | null,
): AgreementForm {
  const studentCount = Number(school?.active_student_count ?? 0);
  const calculated =
    defaults.baseSessionFeeNaira +
    studentCount * defaults.studentRateNaira +
    defaults.cardServiceFeeNaira;

  return {
    agreementId: "",
    schoolId: school?.id ?? "",
    serviceSessionLabel: "",
    startsOn: today(),
    endsOn: "",
    studentCount: String(studentCount),
    baseSessionFeeNaira: String(defaults.baseSessionFeeNaira),
    studentRateNaira: String(defaults.studentRateNaira),
    cardServiceFeeNaira: String(defaults.cardServiceFeeNaira),
    agreedTotalNaira: String(calculated),
    paymentPlan: "FULL",
    firstInstallmentNaira: String(calculated),
    firstDueOn: today(),
    secondInstallmentNaira: "",
    secondDueOn: "",
    agreementNote: "",
  };
}


function agreementForm(agreement: Agreement): AgreementForm {
  return {
    agreementId: agreement.id,
    schoolId: agreement.school_id,
    serviceSessionLabel: agreement.service_session_label ?? "",
    startsOn: agreement.starts_on,
    endsOn: agreement.ends_on,
    studentCount: String(agreement.student_count),
    baseSessionFeeNaira: String(Number(agreement.base_session_fee_kobo) / 100),
    studentRateNaira: String(Number(agreement.student_rate_kobo) / 100),
    cardServiceFeeNaira: String(
      Number(agreement.card_service_fee_kobo) / 100,
    ),
    agreedTotalNaira: String(Number(agreement.agreed_total_kobo) / 100),
    paymentPlan: agreement.payment_plan,
    firstInstallmentNaira: String(
      Number(agreement.first_installment_kobo) / 100,
    ),
    firstDueOn: agreement.first_due_on,
    secondInstallmentNaira:
      agreement.second_installment_kobo == null
        ? ""
        : String(Number(agreement.second_installment_kobo) / 100),
    secondDueOn: agreement.second_due_on ?? "",
    agreementNote: agreement.agreement_note ?? "",
  };
}

export default function SessionCommercialPanel() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [form, setForm] = useState<AgreementForm>(() =>
    blankAgreement(seedDefaults),
  );
  const [baseDefault, setBaseDefault] = useState("550000");
  const [studentDefault, setStudentDefault] = useState("2000");
  const [cardDefault, setCardDefault] = useState("30000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invoiceVatRates, setInvoiceVatRates] = useState<Record<string, string>>({});

  const fetchSnapshot = useCallback(async (): Promise<Snapshot> => {
    const response = await fetch("/api/internal/finance/commercial-model", {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as
      | Snapshot
      | { message?: string };

    if (!response.ok || !("defaults" in body)) {
      throw new Error(
        "message" in body && typeof body.message === "string"
          ? body.message
          : "Could not load the CASA session commercial model.",
      );
    }

    return body;
  }, []);

  const applySnapshot = useCallback((body: Snapshot) => {
    setSnapshot(body);
    setBaseDefault(String(body.defaults.baseSessionFeeNaira));
    setStudentDefault(String(body.defaults.studentRateNaira));
    setCardDefault(String(body.defaults.cardServiceFeeNaira));
    setForm((current) => {
      if (current.agreementId) return current;

      const school =
        body.schools.find((item) => item.id === current.schoolId) ??
        body.schools[0] ??
        null;

      return blankAgreement(body.defaults, school);
    });
  }, []);

  const reload = useCallback(async () => {
    const body = await fetchSnapshot();
    applySnapshot(body);
  }, [applySnapshot, fetchSnapshot]);

  useEffect(() => {
    let cancelled = false;

    void fetchSnapshot()
      .then((body) => {
        if (!cancelled) applySnapshot(body);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load the CASA session commercial model.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applySnapshot, fetchSnapshot]);

  const calculatedTotal = useMemo(
    () =>
      Number(form.baseSessionFeeNaira || 0) +
      Number(form.studentCount || 0) * Number(form.studentRateNaira || 0) +
      Number(form.cardServiceFeeNaira || 0),
    [
      form.baseSessionFeeNaira,
      form.studentCount,
      form.studentRateNaira,
      form.cardServiceFeeNaira,
    ],
  );

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/internal/finance/commercial-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const result = (await response.json().catch(() => ({}))) as {
      message?: string;
      agreementId?: string;
      invoiceNumbers?: string[];
      vatRatePercent?: number;
    };

    if (!response.ok) {
      throw new Error(result.message ?? "Commercial operation failed.");
    }

    return result;
  }

  async function saveDefaults(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await post({
        action: "UPDATE_DEFAULTS",
        baseSessionFeeNaira: Number(baseDefault),
        studentRateNaira: Number(studentDefault),
        cardServiceFeeNaira: Number(cardDefault),
      });

      setNotice("Session pricing defaults updated.");
      await reload();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save defaults.",
      );
    } finally {
      setBusy(false);
    }
  }

  function chooseSchool(schoolId: string) {
    if (!snapshot) return;

    const school =
      snapshot.schools.find((item) => item.id === schoolId) ?? null;

    setForm(blankAgreement(snapshot.defaults, school));
  }

  function startNewAgreement() {
    if (!snapshot) return;

    const school =
      snapshot.schools.find((item) => item.id === form.schoolId) ??
      snapshot.schools[0] ??
      null;

    setForm(blankAgreement(snapshot.defaults, school));
    setNotice("");
    setError("");
  }

  function editAgreement(agreement: Agreement) {
    setForm(agreementForm(agreement));
    setNotice("Draft agreement loaded for editing.");
    setError("");
  }

  async function saveAgreement(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (!form.schoolId) throw new Error("Select a school.");
      if (!form.endsOn) {
        throw new Error("Set the CASA service-session end date.");
      }

      const agreedTotal = Number(form.agreedTotalNaira || calculatedTotal);
      const firstInstallment =
        form.paymentPlan === "FULL"
          ? agreedTotal
          : Number(form.firstInstallmentNaira || 0);
      const secondInstallment =
        form.paymentPlan === "TWO_INSTALLMENTS"
          ? Number(form.secondInstallmentNaira || 0)
          : null;

      const result = await post({
        action: "SAVE_AGREEMENT",
        agreementId: form.agreementId || null,
        schoolId: form.schoolId,
        serviceSessionLabel: form.serviceSessionLabel.trim() || null,
        startsOn: form.startsOn,
        endsOn: form.endsOn,
        studentCount: Number(form.studentCount),
        baseSessionFeeNaira: Number(form.baseSessionFeeNaira),
        studentRateNaira: Number(form.studentRateNaira),
        cardServiceFeeNaira: Number(form.cardServiceFeeNaira),
        agreedTotalNaira: agreedTotal,
        paymentPlan: form.paymentPlan,
        firstInstallmentNaira: firstInstallment,
        firstDueOn: form.firstDueOn,
        secondInstallmentNaira: secondInstallment,
        secondDueOn:
          form.paymentPlan === "TWO_INSTALLMENTS"
            ? form.secondDueOn || null
            : null,
        agreementNote: form.agreementNote.trim() || null,
      });

      const body = await fetchSnapshot();
      applySnapshot(body);

      const savedId = result.agreementId ?? form.agreementId;
      const saved = body.agreements.find((item) => item.id === savedId);
      if (saved) setForm(agreementForm(saved));

      setNotice(
        form.agreementId
          ? "Draft session agreement updated."
          : "Draft session agreement created.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save agreement.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateAgreementStatus(
    action: "MARK_AGREED" | "CANCEL_AGREEMENT",
    agreementId: string,
  ) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await post({ action, agreementId });
      const body = await fetchSnapshot();
      applySnapshot(body);

      if (form.agreementId === agreementId) {
        const school =
          body.schools.find((item) => item.id === form.schoolId) ??
          body.schools[0] ??
          null;
        setForm(blankAgreement(body.defaults, school));
      }

      setNotice(
        action === "MARK_AGREED"
          ? "Session agreement marked agreed. Its commercial figures are now frozen."
          : "Session agreement cancelled.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update the agreement.",
      );
    } finally {
      setBusy(false);
    }
  }


  async function createAgreementInvoices(agreement: Agreement) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const vatText = invoiceVatRates[agreement.id] ?? "";
      const vatRatePercent = vatText.trim() === "" ? 0 : Number(vatText);

      if (!Number.isFinite(vatRatePercent) || vatRatePercent < 0 || vatRatePercent > 100) {
        throw new Error("VAT must be between 0% and 100%.");
      }

      const result = await post({
        action: "CREATE_AGREEMENT_INVOICES",
        agreementId: agreement.id,
        vatRatePercent,
      });

      const invoiceNumbers = result.invoiceNumbers ?? [];
      setNotice(
        invoiceNumbers.length > 0
          ? `Draft invoice schedule created: ${invoiceNumbers.join(", ")}. VAT: ${vatRatePercent}%. Issue and email the invoice(s) from the Invoices tab.`
          : "Draft invoice schedule created.",
      );
      await reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create the session invoice schedule.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!snapshot) {
    return (
      <section className="border-b border-black/15 bg-white px-5 py-8 sm:px-8 lg:px-10">
        <p className="text-sm text-black/55">
          Loading CASA session commercial model...
        </p>
        {error ? <p className="mt-3 text-sm text-[#7e1d18]">{error}</p> : null}
      </section>
    );
  }

  const selectedSchool =
    snapshot.schools.find((item) => item.id === form.schoolId) ?? null;

  return (
    <section className="border-b border-black/15 bg-[#f2f2ef] px-5 py-7 sm:px-8 lg:px-10">
      <div className="border border-black bg-white">
        <div className="border-b border-black p-5">
          <p className="casa-kicker text-black/40">M67 / Commercial model</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
            School session agreements
          </h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-black/55">
            CASA tracks what the school owes under its own service-session
            agreement. Parent or student remittance is not part of CASA Finance.
            The school may recover its cost however it chooses.
          </p>
        </div>

        {notice ? (
          <div className="border-b border-[#145a3b]/30 bg-[#eaf4ed] px-5 py-3 text-sm text-[#145a3b]">
            {notice}
          </div>
        ) : null}

        {error ? (
          <div className="border-b border-[#7e1d18]/30 bg-[#f6e8e6] px-5 py-3 text-sm text-[#7e1d18]">
            {error}
          </div>
        ) : null}

        <div className="grid xl:grid-cols-[360px_minmax(0,1fr)]">
          <form
            className="border-b border-black p-5 xl:border-r xl:border-b-0"
            onSubmit={saveDefaults}
          >
            <p className="casa-kicker text-black/40">Editable defaults</p>
            <h3 className="mt-2 text-xl font-semibold">Session pricing</h3>
            <p className="mt-2 text-xs leading-5 text-black/45">
              These are CASA defaults, not permanent hard-coded prices. Draft
              school agreements can still be adjusted before they are agreed.
            </p>

            <label className="casa-label mt-5">
              <span>Base session fee (NGN)</span>
              <input
                className="casa-field"
                min="0"
                step="1"
                type="number"
                value={baseDefault}
                onChange={(event) => setBaseDefault(event.target.value)}
              />
            </label>

            <label className="casa-label mt-4">
              <span>Student service component / student / session (NGN)</span>
              <input
                className="casa-field"
                min="0"
                step="1"
                type="number"
                value={studentDefault}
                onChange={(event) => setStudentDefault(event.target.value)}
              />
            </label>

            <label className="casa-label mt-4">
              <span>Student ID Card Branding & Production Service / session (NGN)</span>
              <input
                className="casa-field"
                min="0"
                step="1"
                type="number"
                value={cardDefault}
                onChange={(event) => setCardDefault(event.target.value)}
              />
            </label>

            <button className="casa-button-primary mt-5" disabled={busy}>
              {busy ? "Saving..." : "Save pricing defaults"}
            </button>

            <div className="mt-5 border border-black/15 bg-black/[0.02] p-4 text-xs leading-5 text-black/55">
              <strong>Formula:</strong>
              <br />
              Base session fee + (agreed students x per-student rate) + ID Card
              Branding & Production Service.
            </div>
          </form>

          <form className="p-5" onSubmit={saveAgreement}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="casa-kicker text-black/40">School agreement</p>
                <h3 className="mt-2 text-xl font-semibold">
                  {form.agreementId
                    ? "Edit draft session agreement"
                    : "Create draft session agreement"}
                </h3>
              </div>

              {form.agreementId ? (
                <button
                  className="casa-button text-xs"
                  type="button"
                  onClick={startNewAgreement}
                >
                  New agreement
                </button>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="casa-label">
                <span>School</span>
                <select
                  className="casa-field"
                  value={form.schoolId}
                  disabled={Boolean(form.agreementId)}
                  onChange={(event) => chooseSchool(event.target.value)}
                >
                  {snapshot.schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="casa-label">
                <span>Session label (optional)</span>
                <input
                  className="casa-field"
                  value={form.serviceSessionLabel}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      serviceSessionLabel: event.target.value,
                    })
                  }
                  placeholder="e.g. CASA Session 2026/2027"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="casa-label">
                <span>Service session starts</span>
                <input
                  className="casa-field"
                  type="date"
                  value={form.startsOn}
                  onChange={(event) =>
                    setForm({ ...form, startsOn: event.target.value })
                  }
                  required
                />
              </label>

              <label className="casa-label">
                <span>Service session ends</span>
                <input
                  className="casa-field"
                  type="date"
                  value={form.endsOn}
                  onChange={(event) =>
                    setForm({ ...form, endsOn: event.target.value })
                  }
                  required
                />
              </label>

              <label className="casa-label">
                <span>Agreed student count</span>
                <input
                  className="casa-field"
                  min="0"
                  step="1"
                  type="number"
                  value={form.studentCount}
                  onChange={(event) =>
                    setForm({ ...form, studentCount: event.target.value })
                  }
                />
                <span className="mt-1 text-[10px] normal-case tracking-normal text-black/40">
                  Current active records:{" "}
                  {selectedSchool?.active_student_count ?? 0}. The agreement
                  count remains editable.
                </span>
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="casa-label">
                <span>Base session fee (NGN)</span>
                <input
                  className="casa-field"
                  min="0"
                  step="1"
                  type="number"
                  value={form.baseSessionFeeNaira}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      baseSessionFeeNaira: event.target.value,
                    })
                  }
                />
              </label>

              <label className="casa-label">
                <span>Per-student rate (NGN)</span>
                <input
                  className="casa-field"
                  min="0"
                  step="1"
                  type="number"
                  value={form.studentRateNaira}
                  onChange={(event) =>
                    setForm({ ...form, studentRateNaira: event.target.value })
                  }
                />
              </label>

              <label className="casa-label">
                <span>Student ID Card Branding & Production Service (NGN)</span>
                <input
                  className="casa-field"
                  min="0"
                  step="1"
                  type="number"
                  value={form.cardServiceFeeNaira}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      cardServiceFeeNaira: event.target.value,
                    })
                  }
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="border border-black/15 bg-black/[0.02] p-4">
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/40">
                  Calculated CASA session price
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {money(calculatedTotal)}
                </p>
              </div>

              <label className="casa-label border border-black/15 p-4">
                <span>Agreed session total (NGN)</span>
                <input
                  className="casa-field mt-2"
                  min="0.01"
                  step="0.01"
                  type="number"
                  value={form.agreedTotalNaira}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      agreedTotalNaira: event.target.value,
                      firstInstallmentNaira:
                        form.paymentPlan === "FULL"
                          ? event.target.value
                          : form.firstInstallmentNaira,
                    })
                  }
                />
                <span className="mt-2 text-[10px] normal-case tracking-normal text-black/40">
                  CASA may agree a different total without changing the global
                  defaults.
                </span>
              </label>
            </div>

            <div className="mt-5 border-t border-black/15 pt-5">
              <p className="text-sm font-semibold">Payment arrangement</p>

              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="casa-label">
                  <span>Payment option</span>
                  <select
                    className="casa-field"
                    value={form.paymentPlan}
                    onChange={(event) => {
                      const paymentPlan = event.target.value as
                        | "FULL"
                        | "TWO_INSTALLMENTS";

                      setForm({
                        ...form,
                        paymentPlan,
                        firstInstallmentNaira:
                          paymentPlan === "FULL"
                            ? form.agreedTotalNaira
                            : "",
                        secondInstallmentNaira: "",
                        secondDueOn: "",
                      });
                    }}
                  >
                    <option value="FULL">Pay in full</option>
                    <option value="TWO_INSTALLMENTS">
                      Two agreed installments
                    </option>
                  </select>
                </label>

                <label className="casa-label">
                  <span>First payment due</span>
                  <input
                    className="casa-field"
                    type="date"
                    value={form.firstDueOn}
                    onChange={(event) =>
                      setForm({ ...form, firstDueOn: event.target.value })
                    }
                    required
                  />
                </label>
              </div>

              {form.paymentPlan === "FULL" ? (
                <div className="mt-4 border border-black/15 bg-black/[0.02] p-4 text-sm">
                  Full session payment:{" "}
                  <strong>
                    {money(Number(form.agreedTotalNaira || 0))}
                  </strong>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="casa-label">
                    <span>First installment (NGN)</span>
                    <input
                      className="casa-field"
                      min="0.01"
                      step="0.01"
                      type="number"
                      value={form.firstInstallmentNaira}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          firstInstallmentNaira: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label className="casa-label">
                    <span>Second installment (NGN)</span>
                    <input
                      className="casa-field"
                      min="0.01"
                      step="0.01"
                      type="number"
                      value={form.secondInstallmentNaira}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          secondInstallmentNaira: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label className="casa-label">
                    <span>Second payment due</span>
                    <input
                      className="casa-field"
                      type="date"
                      value={form.secondDueOn}
                      onChange={(event) =>
                        setForm({ ...form, secondDueOn: event.target.value })
                      }
                      required
                    />
                  </label>
                </div>
              )}
            </div>

            <label className="casa-label mt-4">
              <span>Commercial agreement note</span>
              <textarea
                className="casa-field min-h-24"
                value={form.agreementNote}
                onChange={(event) =>
                  setForm({ ...form, agreementNote: event.target.value })
                }
              />
            </label>

            <button className="casa-button-primary mt-5" disabled={busy}>
              {busy
                ? "Saving..."
                : form.agreementId
                  ? "Update draft agreement"
                  : "Save draft agreement"}
            </button>
          </form>
        </div>

        <div className="border-t border-black">
          <div className="border-b border-black p-5">
            <p className="casa-kicker text-black/40">Agreement register</p>
            <h3 className="mt-2 text-xl font-semibold">
              CASA school service sessions
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-black bg-black/[0.03] font-mono text-[9px] uppercase tracking-[0.1em] text-black/50">
                <tr>
                  <th className="px-4 py-3">School</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Students</th>
                  <th className="px-4 py-3 text-right">Calculated</th>
                  <th className="px-4 py-3 text-right">Agreed</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-black/10">
                {snapshot.agreements.map((agreement) => (
                  <tr key={agreement.id}>
                    <td className="px-4 py-3 font-medium">
                      {agreement.school_name}
                    </td>
                    <td className="px-4 py-3">
                      <p>
                        {agreement.service_session_label ||
                          "CASA service session"}
                      </p>
                      <p className="mt-1 font-mono text-[9px] text-black/40">
                        {agreement.starts_on} - {agreement.ends_on}
                      </p>
                    </td>
                    <td className="px-4 py-3">{agreement.student_count}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {moneyKobo(agreement.calculated_total_kobo)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold">
                      {moneyKobo(agreement.agreed_total_kobo)}
                    </td>
                    <td className="px-4 py-3">
                      {agreement.payment_plan === "FULL"
                        ? `Full - ${agreement.first_due_on}`
                        : `2 installments - ${agreement.first_due_on} / ${agreement.second_due_on}`}
                    </td>
                    <td className="px-4 py-3">{agreement.status}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {agreement.status === "DRAFT" ? (
                          <>
                            <button
                              className="casa-button text-xs"
                              type="button"
                              onClick={() => editAgreement(agreement)}
                            >
                              Edit
                            </button>
                            <button
                              className="casa-button-primary text-xs"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void updateAgreementStatus(
                                  "MARK_AGREED",
                                  agreement.id,
                                )
                              }
                            >
                              Mark agreed
                            </button>
                          </>
                        ) : null}

                        {agreement.status === "AGREED" &&
                        Number(agreement.invoice_count ?? 0) === 0 ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="casa-label w-28">
                              <span>VAT (%)</span>
                              <input
                                className="casa-field"
                                min="0"
                                max="100"
                                step="0.01"
                                type="number"
                                value={invoiceVatRates[agreement.id] ?? ""}
                                placeholder="0"
                                onChange={(event) =>
                                  setInvoiceVatRates((current) => ({
                                    ...current,
                                    [agreement.id]: event.target.value,
                                  }))
                                }
                              />
                              <span className="mt-1 text-[9px] normal-case tracking-normal text-black/40">
                                Blank = 0%
                              </span>
                            </label>

                            <button
                              className="casa-button-primary text-xs"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void createAgreementInvoices(agreement)
                              }
                            >
                              {agreement.payment_plan === "FULL"
                                ? "Draft invoice"
                                : "Draft 2 invoices"}
                            </button>
                            <p className="basis-full max-w-lg text-[9px] leading-4 text-black/40">
                              New invoices show explanatory organization-branch
                              allocations that add up exactly to the agreed
                              session/installment subtotal. They are not extra
                              branch charges.
                            </p>
                          </div>
                        ) : null}

                        {Number(agreement.invoice_count ?? 0) > 0 ? (
                          <span className="border border-black/20 bg-black/[0.03] px-2 py-1 font-mono text-[9px] uppercase text-black/50">
                            Invoice schedule drafted
                          </span>
                        ) : null}

                        {agreement.status === "DRAFT" ||
                        (agreement.status === "AGREED" &&
                          Number(agreement.invoice_count ?? 0) === 0) ? (
                          <button
                            className="casa-button text-xs"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void updateAgreementStatus(
                                "CANCEL_AGREEMENT",
                                agreement.id,
                              )
                            }
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}

                {snapshot.agreements.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-black/45"
                      colSpan={8}
                    >
                      No CASA session agreements yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
