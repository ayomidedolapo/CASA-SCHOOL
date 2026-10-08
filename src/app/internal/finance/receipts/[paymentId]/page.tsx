import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDb } from "@/db";
import { isAuthRequiredError, requireCasaSuperAdmin } from "@/server/internal/authorization";
import FinancePrintButton from "../../finance-print-button";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows?: unknown }).rows)) return (result as { rows: T[] }).rows;
  return [];
}
function money(value: string | number) { return `NGN ${new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) / 100)}`; }

export default async function ReceiptDocumentPage({ params }: { params: Promise<{ paymentId: string }> }) {
  try { await requireCasaSuperAdmin(); } catch (error) { if (isAuthRequiredError(error)) redirect("/internal/login"); throw error; }
  const { paymentId } = await params; const db = getDb();
  const payment = rowsOf<{ receipt_number:string; amount_kobo:string|number; payment_method:string; payment_reference:string|null; received_on:string; invoice_number:string; school_name:string; total_kobo:string|number; paid_kobo:string|number }>(await db.execute(sql`
    select p.receipt_number,p.amount_kobo,p.payment_method,p.payment_reference,p.received_on::text as received_on,
      i.invoice_number,s.name as school_name,i.total_kobo,
      (select coalesce(sum(all_payments.amount_kobo),0)::bigint from casa_finance_payments all_payments where all_payments.invoice_id=i.id and all_payments.created_at<=p.created_at) as paid_kobo
    from casa_finance_payments p join casa_finance_invoices i on i.id=p.invoice_id join schools s on s.id=p.school_id
    where p.id=${paymentId}::uuid limit 1
  `))[0];
  if (!payment) redirect("/internal/finance");
  const balance=Math.max(Number(payment.total_kobo)-Number(payment.paid_kobo),0);
  return <main className="min-h-screen bg-[#f2f2ef] p-5 text-black print:bg-white print:p-0 sm:p-10"><article className="mx-auto max-w-3xl border border-black bg-white p-6 sm:p-10 print:max-w-none print:border-0"><div className="flex items-start justify-between gap-6 border-b border-black pb-8"><div><p className="font-mono text-xs font-bold uppercase tracking-[0.18em]">CASA</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">Payment receipt</h1><p className="mt-2 font-mono text-sm">{payment.receipt_number}</p></div><FinancePrintButton/></div><div className="py-8"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-black/45">Received from</p><p className="mt-2 text-2xl font-semibold">{payment.school_name}</p></div><dl className="grid grid-cols-2 gap-y-4 border-y border-black/20 py-6 text-sm"><dt className="text-black/45">Invoice</dt><dd className="text-right font-mono">{payment.invoice_number}</dd><dt className="text-black/45">Payment date</dt><dd className="text-right">{payment.received_on}</dd><dt className="text-black/45">Method</dt><dd className="text-right">{payment.payment_method.replaceAll("_"," ")}</dd><dt className="text-black/45">Reference</dt><dd className="text-right">{payment.payment_reference??"-"}</dd></dl><div className="mt-8 border border-black bg-black p-6 text-white"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/55">Amount received</p><p className="mt-3 text-3xl font-semibold">{money(payment.amount_kobo)}</p></div><div className="mt-6 flex justify-between gap-6 text-sm"><span>Remaining invoice balance</span><strong>{money(balance)}</strong></div><footer className="mt-12 border-t border-black pt-5 font-mono text-[9px] uppercase tracking-[0.12em] text-black/45">CASA School - Financial Operations</footer></article></main>;
}
