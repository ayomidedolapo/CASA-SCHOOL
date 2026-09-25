import {
  sendGmailEmail,
} from "./gmail";

export type AccountAccessEmailDelivery =
  | "SENT"
  | "NO_EMAIL"
  | "NOT_CONFIGURED"
  | "FAILED";

function escapeHtml(
  value:
    string,
) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendAccountAccessEmail(
  input: {
    email:
      string | null;
    recipientName:
      string;
    organizationName:
      string;
    actionLabel:
      string;
    actionUrl:
      string;
    expiresAt?:
      string | Date | null;
    context:
      string;
  },
): Promise<AccountAccessEmailDelivery> {
  if (!input.email) {
    return "NO_EMAIL";
  }

  const expiry =
    input.expiresAt
      ? new Date(
          input.expiresAt,
        ).toLocaleString(
          "en-NG",
          {
            dateStyle:
              "medium",
            timeStyle:
              "short",
            timeZone:
              "Africa/Lagos",
          },
        )
      : null;

  const subject =
    `${input.organizationName}: ${input.actionLabel}`;

  const text = [
    `Hello ${input.recipientName},`,
    "",
    input.context,
    "",
    `${input.actionLabel}:`,
    input.actionUrl,
    "",
    expiry
      ? `This private link expires ${expiry}.`
      : "Use your existing CASA sign-in details.",
    "",
    "If you were not expecting this message, contact the organization before opening the link.",
    "",
    "Secure access powered by CASA.",
  ].join("\n");

  const html =
    `<!doctype html><html><body style="margin:0;padding:0;background:#f2f2ef;color:#0b0b0a;font-family:Arial,Helvetica,sans-serif;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f2ef;padding:28px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #d7d7d2;"><tr><td style="padding:32px 34px 18px;"><div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b6b66;">CASA secure access</div><h1 style="margin:12px 0 0;font-size:30px;line-height:1.1;">${escapeHtml(input.organizationName)}</h1></td></tr><tr><td style="padding:8px 34px 30px;font-size:15px;line-height:1.65;"><p>Hello ${escapeHtml(input.recipientName)},</p><p>${escapeHtml(input.context)}</p><p style="margin:28px 0;"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#0b0b0a;color:#fff;text-decoration:none;padding:14px 20px;font-weight:700;">${escapeHtml(input.actionLabel)}</a></p>${expiry ? `<p style="font-size:13px;color:#5b5b56;">This private link expires <strong>${escapeHtml(expiry)}</strong>.</p>` : `<p style="font-size:13px;color:#5b5b56;">Use your existing CASA sign-in details.</p>`}<p style="font-size:12px;word-break:break-all;color:#333;">${escapeHtml(input.actionUrl)}</p><div style="margin-top:28px;padding-top:18px;border-top:1px solid #ddd;font-size:12px;color:#6b6b66;">If you were not expecting this message, contact the organization before opening the link.</div></td></tr><tr><td align="center" style="padding:18px 24px;border-top:1px solid #e2e2de;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#a0a09a;">Secure access powered by CASA</td></tr></table></td></tr></table></body></html>`;

  try {
    const result =
      await sendGmailEmail({
        to:
          input.email,
        subject,
        text,
        html,
        fromName:
          `${input.organizationName} via CASA`,
      });

    if (
      result.ok
    ) {
      return "SENT";
    }

    return result.configured
      ? "FAILED"
      : "NOT_CONFIGURED";
  } catch {
    return "FAILED";
  }
}
