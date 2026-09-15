export type WhatsappNotificationEventType =
  | "STUDENT_CHECKED_IN"
  | "STUDENT_SIGNED_OUT"
  | "STUDENT_EARLY_DEPARTURE";

export interface WhatsappSenderIdentity {
  providerPhoneNumberId: string;
  providerConnectionRef: string;
}

export interface WhatsappProviderReadiness {
  mode: string;
  graphVersionConfigured: boolean;
  credentialSourceConfigured: boolean;
  templatesConfigured: Record<WhatsappNotificationEventType, boolean>;
  webhookVerifyTokenConfigured: boolean;
  webhookAppSecretConfigured: boolean;
}

export class WhatsappProviderError extends Error {
  readonly code: string;
  readonly status: number | null;
  readonly transient: boolean;

  constructor(
    message: string,
    options: {
      code: string;
      status?: number | null;
      transient?: boolean;
    },
  ) {
    super(message);
    this.name = "WhatsappProviderError";
    this.code = options.code;
    this.status = options.status ?? null;
    this.transient = options.transient ?? false;
  }
}

function clean(value: string | undefined | null) {
  return typeof value === "string" ? value.trim() : "";
}

function graphVersion() {
  const value = clean(process.env.CASA_WHATSAPP_GRAPH_VERSION);
  if (!/^v\d+\.\d+$/.test(value)) {
    throw new WhatsappProviderError(
      "CASA_WHATSAPP_GRAPH_VERSION must be configured as a Meta Graph API version such as vXX.X.",
      { code: "META_GRAPH_VERSION_MISSING" },
    );
  }
  return value;
}

function providerMode() {
  const value = clean(process.env.CASA_WHATSAPP_PROVIDER_MODE) || "META_CLOUD";
  if (value !== "META_CLOUD") {
    throw new WhatsappProviderError(
      `Unsupported WhatsApp provider mode: ${value}.`,
      { code: "WHATSAPP_PROVIDER_MODE_UNSUPPORTED" },
    );
  }
  return value;
}

function connectionMap() {
  const raw = clean(process.env.CASA_WHATSAPP_META_CONNECTIONS_JSON);
  if (!raw) return {} as Record<string, string>;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object.");
    }

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && clean(key) && clean(value)) {
        result[clean(key)] = clean(value);
      }
    }
    return result;
  } catch (cause) {
    throw new WhatsappProviderError(
      `CASA_WHATSAPP_META_CONNECTIONS_JSON is invalid: ${cause instanceof Error ? cause.message : "invalid JSON"}`,
      { code: "META_CONNECTION_MAP_INVALID" },
    );
  }
}

function resolveAccessToken(connectionRef: string) {
  const ref = clean(connectionRef);
  if (!ref) {
    throw new WhatsappProviderError(
      "WhatsApp sender has no provider connection reference.",
      { code: "META_CONNECTION_REF_MISSING" },
    );
  }

  const mapped = connectionMap()[ref];
  if (mapped) return mapped;

  if (ref === "META_DEFAULT") {
    const fallback = clean(process.env.CASA_WHATSAPP_META_ACCESS_TOKEN);
    if (fallback) return fallback;
  }

  throw new WhatsappProviderError(
    `No server-side Meta credential is configured for connection reference '${ref}'.`,
    { code: "META_CONNECTION_NOT_CONFIGURED" },
  );
}

function templateName(eventType: WhatsappNotificationEventType) {
  const key =
    eventType === "STUDENT_CHECKED_IN"
      ? "CASA_WHATSAPP_TEMPLATE_STUDENT_CHECKED_IN"
      : eventType === "STUDENT_SIGNED_OUT"
        ? "CASA_WHATSAPP_TEMPLATE_STUDENT_SIGNED_OUT"
        : "CASA_WHATSAPP_TEMPLATE_STUDENT_EARLY_DEPARTURE";

  const value = clean(process.env[key]);
  if (!value) {
    throw new WhatsappProviderError(
      `Approved Meta WhatsApp template is not configured for ${eventType}.`,
      { code: "META_TEMPLATE_MISSING" },
    );
  }
  return value;
}

export function normalizeWhatsappRecipient(
  rawPhone: string,
  defaultCountryCode = clean(process.env.CASA_WHATSAPP_DEFAULT_COUNTRY_CODE),
) {
  let digits = clean(rawPhone).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  const country = clean(defaultCountryCode).replace(/\D/g, "");
  if (digits.startsWith("0") && country) {
    digits = `${country}${digits.slice(1)}`;
  }

  if (!/^\d{8,15}$/.test(digits)) {
    throw new WhatsappProviderError(
      "Guardian phone number is not a usable international WhatsApp destination.",
      { code: "RECIPIENT_PHONE_INVALID" },
    );
  }
  return digits;
}

export function isTransientWhatsappHttpStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function whatsappRetryDelaySeconds(attemptCount: number) {
  const safeAttempt = Math.max(1, Math.min(12, Math.trunc(attemptCount) || 1));
  return Math.min(3600, 60 * 2 ** (safeAttempt - 1));
}

export function getWhatsappProviderReadiness(): WhatsappProviderReadiness {
  const mapRaw = clean(process.env.CASA_WHATSAPP_META_CONNECTIONS_JSON);
  const fallback = clean(process.env.CASA_WHATSAPP_META_ACCESS_TOKEN);

  return {
    mode: clean(process.env.CASA_WHATSAPP_PROVIDER_MODE) || "META_CLOUD",
    graphVersionConfigured: /^v\d+\.\d+$/.test(clean(process.env.CASA_WHATSAPP_GRAPH_VERSION)),
    credentialSourceConfigured: Boolean(mapRaw || fallback),
    templatesConfigured: {
      STUDENT_CHECKED_IN: Boolean(clean(process.env.CASA_WHATSAPP_TEMPLATE_STUDENT_CHECKED_IN)),
      STUDENT_SIGNED_OUT: Boolean(clean(process.env.CASA_WHATSAPP_TEMPLATE_STUDENT_SIGNED_OUT)),
      STUDENT_EARLY_DEPARTURE: Boolean(clean(process.env.CASA_WHATSAPP_TEMPLATE_STUDENT_EARLY_DEPARTURE)),
    },
    webhookVerifyTokenConfigured: Boolean(clean(process.env.CASA_WHATSAPP_META_WEBHOOK_VERIFY_TOKEN)),
    webhookAppSecretConfigured: Boolean(clean(process.env.CASA_WHATSAPP_META_APP_SECRET)),
  };
}

function providerErrorCode(body: unknown) {
  if (!body || typeof body !== "object") return "META_HTTP_ERROR";
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "META_HTTP_ERROR";
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" || typeof code === "string"
    ? `META_${String(code)}`.slice(0, 80)
    : "META_HTTP_ERROR";
}

function providerErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message.trim() : fallback;
}

async function metaRequest(
  path: string,
  connectionRef: string,
  init: RequestInit,
) {
  providerMode();
  const token = resolveAccessToken(connectionRef);
  const url = `https://graph.facebook.com/${graphVersion()}/${path.replace(/^\/+/, "")}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (cause) {
    throw new WhatsappProviderError(
      `Meta WhatsApp request could not complete: ${cause instanceof Error ? cause.message : "network failure"}`,
      { code: "META_NETWORK_FAILURE", transient: true },
    );
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new WhatsappProviderError(
      providerErrorMessage(body, `Meta WhatsApp returned HTTP ${response.status}.`),
      {
        code: providerErrorCode(body),
        status: response.status,
        transient: isTransientWhatsappHttpStatus(response.status),
      },
    );
  }
  return body as Record<string, unknown>;
}

export async function verifyMetaWhatsappSender(input: {
  providerPhoneNumberId: string;
  providerConnectionRef: string;
}) {
  const phoneId = clean(input.providerPhoneNumberId);
  if (!/^[A-Za-z0-9_-]{4,120}$/.test(phoneId)) {
    throw new WhatsappProviderError(
      "Meta phone-number ID is invalid.",
      { code: "META_PHONE_NUMBER_ID_INVALID" },
    );
  }

  const body = await metaRequest(
    `${encodeURIComponent(phoneId)}?fields=id,display_phone_number,verified_name`,
    input.providerConnectionRef,
    { method: "GET" },
  );

  const returnedId = clean(typeof body.id === "string" ? body.id : "");
  if (returnedId && returnedId !== phoneId) {
    throw new WhatsappProviderError(
      "Meta returned a different phone-number identity than the requested sender.",
      { code: "META_PHONE_NUMBER_ID_MISMATCH" },
    );
  }

  const displayPhoneNumber = clean(
    typeof body.display_phone_number === "string" ? body.display_phone_number : "",
  );
  if (!displayPhoneNumber) {
    throw new WhatsappProviderError(
      "Meta did not return a display phone number for this sender.",
      { code: "META_PHONE_METADATA_INCOMPLETE" },
    );
  }

  return {
    providerPhoneNumberId: phoneId,
    displayPhoneNumber,
    verifiedName: clean(typeof body.verified_name === "string" ? body.verified_name : "") || "WhatsApp Business",
  };
}

export async function sendMetaWhatsappTemplate(input: {
  sender: WhatsappSenderIdentity;
  eventType: WhatsappNotificationEventType;
  recipientPhone: string;
  message: string;
}) {
  const phoneId = clean(input.sender.providerPhoneNumberId);
  const message = clean(input.message);
  if (!message) {
    throw new WhatsappProviderError(
      "Queued WhatsApp notification has no renderable message.",
      { code: "OUTBOX_MESSAGE_MISSING" },
    );
  }

  const body = await metaRequest(
    `${encodeURIComponent(phoneId)}/messages`,
    input.sender.providerConnectionRef,
    {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeWhatsappRecipient(input.recipientPhone),
        type: "template",
        template: {
          name: templateName(input.eventType),
          language: {
            code: clean(process.env.CASA_WHATSAPP_TEMPLATE_LANGUAGE) || "en",
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  text: message.slice(0, 1024),
                },
              ],
            },
          ],
        },
      }),
    },
  );

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const first = messages[0];
  const messageId =
    first && typeof first === "object" && typeof (first as { id?: unknown }).id === "string"
      ? clean((first as { id: string }).id)
      : "";

  if (!messageId) {
    throw new WhatsappProviderError(
      "Meta accepted the request without returning a provider message ID.",
      { code: "META_MESSAGE_ID_MISSING", transient: true },
    );
  }

  return { messageId };
}
