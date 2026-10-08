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

export default async function InvoiceDocumentPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  try { await requireCasaSuperAdmin(); } catch (error) { if (isAuthRequiredError(error)) redirect("/internal/login"); throw error; }
  const { invoiceId } = await params; const db = getDb();
  const invoice = rowsOf<{ invoice_number:string; school_name:string; bill_to_name:string; bill_to_contact_name:string|null; bill_to_email:string|null; status:string; issued_on:string|null; due_on:string|null; subtotal_kobo:string|number; tax_label:string; tax_rate_bps:number; tax_kobo:string|number; total_kobo:string|number; notes:string|null }>(await db.execute(sql`
    select i.invoice_number,s.name as school_name,i.bill_to_name,i.bill_to_contact_name,i.bill_to_email,i.status,
      i.issued_on::text as issued_on,i.due_on::text as due_on,i.subtotal_kobo,i.tax_label,i.tax_rate_bps,i.tax_kobo,i.total_kobo,i.notes
    from casa_finance_invoices i join schools s on s.id=i.school_id where i.id=${invoiceId}::uuid limit 1
  `))[0];
  if (!invoice) redirect("/internal/finance");
  const lines = rowsOf<{ description:string; quantity:string|number; unit_amount_kobo:string|number; amount_kobo:string|number }>(await db.execute(sql`
    select description,quantity,unit_amount_kobo,amount_kobo from casa_finance_invoice_lines where invoice_id=${invoiceId}::uuid order by sort_order,created_at
  `));
  return <main className="min-h-screen bg-[#f2f2ef] p-5 text-black print:bg-white print:p-0 sm:p-10"><article className="mx-auto max-w-4xl border border-black bg-white p-6 sm:p-10 print:max-w-none print:border-0"><div className="flex items-start justify-between gap-6 border-b border-black pb-8"><div><p className="font-mono text-xs font-bold uppercase tracking-[0.18em]">CASA</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em]">Invoice</h1><p className="mt-2 font-mono text-sm">{invoice.invoice_number}</p></div><FinancePrintButton/></div><div className="grid gap-8 border-b border-black/20 py-8 sm:grid-cols-2"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-black/45">Bill to</p><p className="mt-2 text-xl font-semibold">{invoice.bill_to_name}</p>{invoice.bill_to_contact_name?<p className="mt-1 text-sm">{invoice.bill_to_contact_name}</p>:null}{invoice.bill_to_email?<p className="mt-1 text-sm text-black/55">{invoice.bill_to_email}</p>:null}</div><dl className="grid grid-cols-2 gap-y-2 text-sm"><dt className="text-black/45">Status</dt><dd className="text-right font-semibold">{invoice.status}</dd><dt className="text-black/45">Issued</dt><dd className="text-right">{invoice.issued_on??"-"}</dd><dt className="text-black/45">Due</dt><dd className="text-right">{invoice.due_on??"-"}</dd></dl></div><div className="overflow-x-auto py-8"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-y border-black font-mono text-[10px] uppercase tracking-[0.1em]"><tr><th className="py-3">Description</th><th className="py-3 text-right">Quantity</th><th className="py-3 text-right">Unit</th><th className="py-3 text-right">Amount</th></tr></thead><tbody className="divide-y divide-black/10">{lines.map((line,index)=><tr key={`${line.description}-${index}`}><td className="py-4">{line.description}</td><td className="py-4 text-right">{Number(line.quantity)}</td><td className="py-4 text-right font-mono">{money(line.unit_amount_kobo)}</td><td className="py-4 text-right font-mono font-semibold">{money(line.amount_kobo)}</td></tr>)}</tbody></table></div><div className="ml-auto max-w-md border-t border-black pt-5"><div className="flex justify-between gap-6 text-sm"><span>Subtotal</span><strong>{money(invoice.subtotal_kobo)}</strong></div><div className="mt-3 flex justify-between gap-6 text-sm"><span>{invoice.tax_label} ({(invoice.tax_rate_bps/100).toFixed(2)}%)</span><strong>{money(invoice.tax_kobo)}</strong></div><div className="mt-5 flex justify-between gap-6 border-t border-black pt-5 text-xl"><span>Total due</span><strong>{money(invoice.total_kobo)}</strong></div></div>{invoice.notes?<div className="mt-10 border-t border-black/20 pt-6 text-sm leading-6"><p className="font-semibold">Note</p><p className="mt-2 text-black/60">{invoice.notes}</p></div>:null}<footer className="mt-12 border-t border-black pt-5 font-mono text-[9px] uppercase tracking-[0.12em] text-black/45">CASA School - Financial Operations</footer></article></main>;
}
