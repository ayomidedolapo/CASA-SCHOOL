type GmailSendInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  fromName: string;
};

export type GmailSendResult =
  | {
      ok: true;
      configured: true;
      messageId: string | null;
    }
  | {
      ok: false;
      configured: false;
      code: "GMAIL_NOT_CONFIGURED";
    }
  | {
      ok: false;
      configured: true;
      code:
        | "GMAIL_TOKEN_FAILED"
        | "GMAIL_SEND_FAILED";
    };

function readConfig() {
  const clientId =
    process.env.CASA_GMAIL_OAUTH_CLIENT_ID?.trim();
  const clientSecret =
    process.env.CASA_GMAIL_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken =
    process.env.CASA_GMAIL_OAUTH_REFRESH_TOKEN?.trim();
  const senderEmail =
    process.env.CASA_GMAIL_SENDER_EMAIL?.trim();

  if (
    !clientId ||
    !clientSecret ||
    !refreshToken ||
    !senderEmail
  ) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
    senderEmail,
  };
}

function safeHeader(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function encodedHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(
    safeHeader(value),
    "utf8",
  ).toString("base64")}?=`;
}

function base64Url(value: string) {
  return Buffer.from(
    value,
    "utf8",
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function sendGmailEmail(
  input: GmailSendInput,
): Promise<GmailSendResult> {
  const config =
    readConfig();

  if (!config) {
    return {
      ok: false,
      configured: false,
      code: "GMAIL_NOT_CONFIGURED",
    };
  }

  const tokenResponse =
    await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },
        body:
          new URLSearchParams({
            client_id:
              config.clientId,
            client_secret:
              config.clientSecret,
            refresh_token:
              config.refreshToken,
            grant_type:
              "refresh_token",
          }),
        cache: "no-store",
      },
    );

  if (!tokenResponse.ok) {
    return {
      ok: false,
      configured: true,
      code: "GMAIL_TOKEN_FAILED",
    };
  }

  const tokenBody =
    await tokenResponse.json() as {
      access_token?: string;
    };

  if (!tokenBody.access_token) {
    return {
      ok: false,
      configured: true,
      code: "GMAIL_TOKEN_FAILED",
    };
  }

  const boundary =
    `casa_${Date.now().toString(36)}`;

  const mime = [
    `From: ${encodedHeader(input.fromName)} <${safeHeader(config.senderEmail)}>`,
    `To: ${safeHeader(input.to)}`,
    `Subject: ${encodedHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const sendResponse =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${tokenBody.access_token}`,
          "Content-Type":
            "application/json",
        },
        body:
          JSON.stringify({
            raw:
              base64Url(
                mime,
              ),
          }),
        cache: "no-store",
      },
    );

  if (!sendResponse.ok) {
    return {
      ok: false,
      configured: true,
      code: "GMAIL_SEND_FAILED",
    };
  }

  const sent =
    await sendResponse.json() as {
      id?: string;
    };

  return {
    ok: true,
    configured: true,
    messageId:
      sent.id ?? null,
  };
}
