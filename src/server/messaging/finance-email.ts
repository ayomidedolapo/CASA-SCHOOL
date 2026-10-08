import { sendGmailEmail } from "./gmail";

type InvoiceLine = {
  description: string;
  quantity: number;
  amountKobo: number;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(kobo: number) {
  return `NGN ${new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(kobo / 100)}`;
}

function date(value: string | Date | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-NG", {
    dateStyle: "medium",
    timeZone: "Africa/Lagos",
  });
}

function shell(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f2f2ef;color:#0b0b0a;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f2ef;padding:28px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;background:#fff;border:1px solid #111;"><tr><td style="padding:30px 34px 18px;border-bottom:1px solid #111;"><div style="font-family:monospace;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;">CASA</div><h1 style="margin:12px 0 0;font-size:30px;line-height:1.1;">${escapeHtml(title)}</h1></td></tr><tr><td style="padding:28px 34px;">${body}</td></tr><tr><td style="padding:18px 34px;border-top:1px solid #ddd;font-size:11px;color:#666;">CASA School - financial operations</td></tr></table></td></tr></table></body></html>`;
}

export async function sendFinanceInvoiceEmail(input: {
  to: string;
  schoolName: string;
  invoiceNumber: string;
  issuedOn: string | Date | null;
  dueOn: string | Date | null;
  lines: InvoiceLine[];
  subtotalKobo: number;
  taxLabel: string;
  taxRatePercent: number;
  taxKobo: number;
  totalKobo: number;
  notes: string | null;
}) {
  const rows = input.lines
    .map(
      (line) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;">${escapeHtml(line.description)}</td><td align="right" style="padding:10px 12px;border-bottom:1px solid #eee;">${line.quantity}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #eee;font-weight:700;">${money(line.amountKobo)}</td></tr>`,
    )
    .join("");

  const html = shell(
    `Invoice ${input.invoiceNumber}`,
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">Hello ${escapeHtml(input.schoolName)},<br>Please find your CASA service invoice below.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:22px;font-size:13px;"><tr><td><strong>Invoice</strong></td><td align="right">${escapeHtml(input.invoiceNumber)}</td></tr><tr><td style="padding-top:8px;"><strong>Issued</strong></td><td align="right" style="padding-top:8px;">${escapeHtml(date(input.issuedOn))}</td></tr><tr><td style="padding-top:8px;"><strong>Due</strong></td><td align="right" style="padding-top:8px;">${escapeHtml(date(input.dueOn))}</td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;border-top:1px solid #111;"><tr><th align="left" style="padding:10px 0;border-bottom:1px solid #111;">Item</th><th align="right" style="padding:10px 12px;border-bottom:1px solid #111;">Qty</th><th align="right" style="padding:10px 0;border-bottom:1px solid #111;">Amount</th></tr>${rows}</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px;font-size:13px;"><tr><td>Subtotal</td><td align="right">${money(input.subtotalKobo)}</td></tr><tr><td style="padding-top:8px;">${escapeHtml(input.taxLabel)} (${input.taxRatePercent.toFixed(2)}%)</td><td align="right" style="padding-top:8px;">${money(input.taxKobo)}</td></tr><tr><td style="padding-top:12px;font-size:18px;font-weight:700;">Total due</td><td align="right" style="padding-top:12px;font-size:18px;font-weight:700;">${money(input.totalKobo)}</td></tr></table>${input.notes ? `<p style="margin:24px 0 0;padding-top:18px;border-top:1px solid #ddd;font-size:12px;line-height:1.6;"><strong>Note:</strong> ${escapeHtml(input.notes)}</p>` : ""}`,
  );

  const text = [
    `CASA Invoice ${input.invoiceNumber}`,
    `School: ${input.schoolName}`,
    `Issued: ${date(input.issuedOn)}`,
    `Due: ${date(input.dueOn)}`,
    "",
    ...input.lines.map((line) => `${line.description} x ${line.quantity}: ${money(line.amountKobo)}`),
    "",
    `Subtotal: ${money(input.subtotalKobo)}`,
    `${input.taxLabel}: ${money(input.taxKobo)}`,
    `Total: ${money(input.totalKobo)}`,
    input.notes ? `Note: ${input.notes}` : "",
  ].filter(Boolean).join("\n");

  return sendGmailEmail({
    to: input.to,
    subject: `CASA Invoice ${input.invoiceNumber} - ${input.schoolName}`,
    text,
    html,
    fromName: "CASA School",
  });
}

export async function sendFinanceReceiptEmail(input: {
  to: string;
  schoolName: string;
  invoiceNumber: string;
  receiptNumber: string;
  amountKobo: number;
  receivedOn: string | Date;
  paymentMethod: string;
  paymentReference: string | null;
  remainingBalanceKobo: number;
}) {
  const html = shell(
    `Receipt ${input.receiptNumber}`,
    `<p style="margin:0 0 22px;font-size:15px;line-height:1.6;">CASA confirms receipt of payment from ${escapeHtml(input.schoolName)}.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:13px;"><tr><td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Invoice</strong></td><td align="right" style="border-bottom:1px solid #eee;">${escapeHtml(input.invoiceNumber)}</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Payment date</strong></td><td align="right" style="border-bottom:1px solid #eee;">${escapeHtml(date(input.receivedOn))}</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Method</strong></td><td align="right" style="border-bottom:1px solid #eee;">${escapeHtml(input.paymentMethod.replaceAll("_", " "))}</td></tr>${input.paymentReference ? `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;"><strong>Reference</strong></td><td align="right" style="border-bottom:1px solid #eee;">${escapeHtml(input.paymentReference)}</td></tr>` : ""}<tr><td style="padding-top:16px;font-size:18px;font-weight:700;">Amount received</td><td align="right" style="padding-top:16px;font-size:18px;font-weight:700;">${money(input.amountKobo)}</td></tr><tr><td style="padding-top:8px;">Remaining invoice balance</td><td align="right" style="padding-top:8px;">${money(input.remainingBalanceKobo)}</td></tr></table>`,
  );

  const text = [
    `CASA Receipt ${input.receiptNumber}`,
    `School: ${input.schoolName}`,
    `Invoice: ${input.invoiceNumber}`,
    `Payment date: ${date(input.receivedOn)}`,
    `Amount received: ${money(input.amountKobo)}`,
    `Method: ${input.paymentMethod.replaceAll("_", " ")}`,
    input.paymentReference ? `Reference: ${input.paymentReference}` : "",
    `Remaining balance: ${money(input.remainingBalanceKobo)}`,
  ].filter(Boolean).join("\n");

  return sendGmailEmail({
    to: input.to,
    subject: `CASA Receipt ${input.receiptNumber} - ${input.schoolName}`,
    text,
    html,
    fromName: "CASA School",
  });
}
