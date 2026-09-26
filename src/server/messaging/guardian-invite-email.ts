import {
  sendGmailEmail,
} from "./gmail";

export type GuardianInviteEmailDelivery =
  | "SENT"
  | "NO_EMAIL"
  | "NOT_CONFIGURED"
  | "FAILED";

function escapeHtml(
  value: string,
) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendGuardianInviteEmail(
  input: {
    email:
      string | null;
    guardianName: string;
    schoolName: string;
    schoolId: string;
    branchId:
      string | null;
    studentName: string;
    inviteUrl: string;
    origin: string;
    expiresAt:
      string | Date;
  },
): Promise<GuardianInviteEmailDelivery> {
  if (!input.email) {
    return "NO_EMAIL";
  }

  const expires =
    new Date(
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
    );

  const logoUrl =
    `${input.origin}/api/public/schools/${encodeURIComponent(
      input.schoolId,
    )}/notification-logo${
      input.branchId
        ? `?branchId=${encodeURIComponent(
            input.branchId,
          )}`
        : ""
    }`;

  const subject =
    `${input.schoolName}: guardian notification setup`;

  const text = [
    `Hello ${input.guardianName},`,
    "",
    `${input.schoolName} has created a private guardian notification setup link for ${input.studentName}.`,
    "Use this link to enable trusted school check-in, check-out and approved early-departure notifications.",
    "",
    input.inviteUrl,
    "",
    `This one-time link expires ${expires}.`,
    `If you were not expecting this message, contact ${input.schoolName} before opening the link.`,
    "",
    "Secure notification delivery powered by CASA.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f2f2ef;color:#0b0b0a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f2ef;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #d7d7d2;">
            <tr>
              <td style="padding:32px 34px 18px;">
                <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(input.schoolName)} logo" width="76" height="76" style="display:block;object-fit:contain;margin-bottom:22px;" />
                <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b6b66;">Guardian notification setup</div>
                <h1 style="margin:12px 0 0;font-size:30px;line-height:1.1;">${escapeHtml(input.schoolName)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 34px 30px;font-size:15px;line-height:1.65;">
                <p>Hello ${escapeHtml(input.guardianName)},</p>
                <p>${escapeHtml(input.schoolName)} has created a private notification link for <strong>${escapeHtml(input.studentName)}</strong>.</p>
                <p>This link enables trusted school notifications such as check-in, check-out and approved early departure alerts.</p>
                <p style="margin:28px 0;">
                  <a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#0b0b0a;color:#ffffff;text-decoration:none;padding:14px 20px;font-weight:700;">Enable school notifications</a>
                </p>
                <p style="font-size:13px;color:#5b5b56;">The link is private, one-time, and expires <strong>${escapeHtml(expires)}</strong>.</p>
                <p style="font-size:13px;color:#5b5b56;">If the button does not work, copy this address into your browser:</p>
                <p style="font-size:12px;line-height:1.5;word-break:break-all;color:#333333;">${escapeHtml(input.inviteUrl)}</p>
                <div style="margin-top:28px;padding-top:18px;border-top:1px solid #ddddda;font-size:12px;line-height:1.5;color:#6b6b66;">
                  If you were not expecting this message, contact ${escapeHtml(input.schoolName)} before opening the link.
                </div>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px 24px;border-top:1px solid #e2e2de;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#a0a09a;">
                Secure notification delivery powered by CASA
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  try {
    const result =
      await sendGmailEmail({
        to:
          input.email,
        subject,
        text,
        html,
        fromName:
          `${input.schoolName} via CASA`,
      });

    if (result.ok) {
      return "SENT";
    }

    return result.configured
      ? "FAILED"
      : "NOT_CONFIGURED";
  } catch {
    return "FAILED";
  }
}
