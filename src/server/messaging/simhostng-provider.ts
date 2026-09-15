export type SmsNotificationEventType =
  | "STUDENT_CHECKED_IN"
  | "STUDENT_SIGNED_OUT"
  | "STUDENT_EARLY_DEPARTURE";

export class SimhostngProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly transient: boolean,
  ) {
    super(message);
    this.name = "SimhostngProviderError";
  }
}

const SIMHOSTNG_SMS_ENDPOINT =
  "https://simhostng.com/api/sms";

const DEFAULT_COUNTRY_CODE = "234";
const DEFAULT_TIMEOUT_MS = 15_000;

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

function configuredSimSlot() {
  const raw = env("CASA_SIMHOSTNG_SIM_SLOT");
  return raw === "1" || raw === "2"
    ? raw
    : "";
}

export function getSimhostngProviderReadiness() {
  const mode =
    env("CASA_SMS_PROVIDER_MODE")
      .toUpperCase();
  const apiKeyConfigured =
    env("CASA_SIMHOSTNG_API_KEY")
      .length > 0;
  const serverIdConfigured =
    env("CASA_SIMHOSTNG_SERVER_ID")
      .length > 0;
  const simSlot =
    configuredSimSlot();
  const simSlotConfigured =
    simSlot.length > 0;

  return {
    mode:
      mode || "DISABLED",
    ready:
      mode === "SIMHOSTNG" &&
      apiKeyConfigured &&
      serverIdConfigured &&
      simSlotConfigured,
    apiKeyConfigured,
    serverIdConfigured,
    simSlotConfigured,
    simSlot:
      simSlot || null,
  };
}

function providerConfiguration() {
  const readiness =
    getSimhostngProviderReadiness();

  if (
    readiness.mode !==
    "SIMHOSTNG"
  ) {
    throw new SimhostngProviderError(
      "CASA SMS provider mode is not SIMHOSTNG.",
      "SMS_PROVIDER_DISABLED",
      false,
    );
  }

  if (!readiness.ready) {
    throw new SimhostngProviderError(
      "SimHostNG SMS runtime configuration is incomplete.",
      "SIMHOSTNG_CONFIGURATION_INCOMPLETE",
      false,
    );
  }

  return {
    apiKey:
      env(
        "CASA_SIMHOSTNG_API_KEY",
      ),
    serverId:
      env(
        "CASA_SIMHOSTNG_SERVER_ID",
      ),
    simSlot:
      readiness.simSlot as
        | "1"
        | "2",
  };
}

export function normalizeSimhostngRecipient(
  raw: string,
) {
  const stripped =
    raw
      .trim()
      .replace(
        /[\s().-]/g,
        "",
      );

  const countryCode =
    (
      env(
        "CASA_SMS_DEFAULT_COUNTRY_CODE",
      ) ||
      DEFAULT_COUNTRY_CODE
    ).replace(
      /^\+/,
      "",
    );

  let local =
    stripped;

  if (
    local.startsWith(
      `+${countryCode}`,
    )
  ) {
    local =
      `0${local.slice(
        countryCode.length +
          1,
      )}`;
  } else if (
    local.startsWith(
      countryCode,
    )
  ) {
    local =
      `0${local.slice(
        countryCode.length,
      )}`;
  }

  if (
    !/^0\d{10}$/.test(
      local,
    )
  ) {
    throw new SimhostngProviderError(
      "Guardian SMS destination is not a valid Nigerian mobile number.",
      "SMS_RECIPIENT_INVALID",
      false,
    );
  }

  return local;
}

function cleanInlineText(
  value: string,
) {
  return value
    .replace(
      /[\r\n\t]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function payloadObject(
  value: unknown,
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value,
    )
  ) {
    return {} as
      Record<string, unknown>;
  }

  return value as
    Record<string, unknown>;
}

function requiredPayloadText(
  payload:
    Record<string, unknown>,
  key: string,
) {
  const value =
    payload[key];

  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new SimhostngProviderError(
      `Notification payload is missing ${key}.`,
      "SMS_PAYLOAD_INVALID",
      false,
    );
  }

  return cleanInlineText(
    value,
  );
}

function timestampForEvent(
  eventType:
    SmsNotificationEventType,
  payload:
    Record<string, unknown>,
) {
  const key =
    eventType ===
    "STUDENT_CHECKED_IN"
      ? "checkedInAt"
      : "signedOutAt";

  const value =
    requiredPayloadText(
      payload,
      key,
    );
  const parsed =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    throw new SimhostngProviderError(
      `Notification payload has an invalid ${key}.`,
      "SMS_PAYLOAD_INVALID",
      false,
    );
  }

  return parsed;
}

function formatSchoolTime(
  value: Date,
  timeZone: string,
) {
  try {
    return new Intl.DateTimeFormat(
      "en-NG",
      {
        timeZone,
        hour:
          "numeric",
        minute:
          "2-digit",
        hour12:
          true,
      },
    ).format(
      value,
    );
  } catch {
    throw new SimhostngProviderError(
      "School timezone is invalid for SMS rendering.",
      "SMS_TIMEZONE_INVALID",
      false,
    );
  }
}

export function renderAttendanceSms(
  input: {
    eventType:
      SmsNotificationEventType;
    payload:
      unknown;
    schoolName:
      string;
    note?:
      string | null;
    timeZone:
      string;
  },
) {
  const payload =
    payloadObject(
      input.payload,
    );
  const studentName =
    requiredPayloadText(
      payload,
      "studentName",
    );
  const schoolName =
    cleanInlineText(
      input.schoolName,
    );
  const note =
    cleanInlineText(
      input.note ?? "",
    );

  if (!schoolName) {
    throw new SimhostngProviderError(
      "School SMS display name is missing.",
      "SMS_SCHOOL_NAME_MISSING",
      false,
    );
  }

  const occurredAt =
    timestampForEvent(
      input.eventType,
      payload,
    );
  const at =
    formatSchoolTime(
      occurredAt,
      input.timeZone,
    );

  const eventText =
    input.eventType ===
    "STUDENT_CHECKED_IN"
      ? `has arrived at school and checked in successfully. Time: ${at}.`
      : input.eventType ===
          "STUDENT_EARLY_DEPARTURE"
        ? `has checked out of school early. Time: ${at}.`
        : `has checked out of school for the day. Time: ${at}.`;

  return [
    `${schoolName}: ${studentName} ${eventText}`,
    note || null,
    "CASA - Do not reply.",
  ]
    .filter(
      (
        value,
      ): value is string =>
        Boolean(
          value,
        ),
    )
    .join(
      " ",
    );
}

export function isTransientSmsHttpStatus(
  status: number,
) {
  return (
    status ===
      408 ||
    status ===
      425 ||
    status ===
      429 ||
    status >=
      500
  );
}

export function smsRetryDelaySeconds(
  attemptCount: number,
) {
  const safe =
    Math.max(
      1,
      Math.trunc(
        attemptCount,
      ),
    );

  return Math.min(
    3600,
    30 *
      2 **
        Math.min(
          6,
          safe -
            1,
        ),
  );
}

function providerResponseIsTransient(
  value: string,
) {
  return /setup\s+incomplete|offline|timeout|temporar|busy|unavailable|network/i.test(
    value,
  );
}

export async function sendSimhostngSms(
  input: {
    recipientPhone:
      string;
    message:
      string;
    reference:
      string;
  },
) {
  const configuration =
    providerConfiguration();
  const recipient =
    normalizeSimhostngRecipient(
      input.recipientPhone,
    );
  const message =
    cleanInlineText(
      input.message,
    );

  if (!message) {
    throw new SimhostngProviderError(
      "SMS message body is empty.",
      "SMS_MESSAGE_EMPTY",
      false,
    );
  }

  const form =
    new URLSearchParams({
      apikey:
        configuration.apiKey,
      server:
        configuration.serverId,
      sim:
        configuration.simSlot,
      number:
        recipient,
      message,
      ref:
        input.reference,
    });

  const controller =
    new AbortController();
  const timer =
    setTimeout(
      () =>
        controller.abort(),
      DEFAULT_TIMEOUT_MS,
    );

  let response:
    Response;

  try {
    response =
      await fetch(
        SIMHOSTNG_SMS_ENDPOINT,
        {
          method:
            "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body:
            form.toString(),
          cache:
            "no-store",
          signal:
            controller.signal,
        },
      );
  } catch (
    cause
  ) {
    throw new SimhostngProviderError(
      cause instanceof Error
        ? cause.message
        : "SimHostNG request failed.",
      "SIMHOSTNG_TRANSPORT_ERROR",
      true,
    );
  } finally {
    clearTimeout(
      timer,
    );
  }

  const text =
    (
      await response
        .text()
        .catch(
          () => "",
        )
    ).trim();

  if (!response.ok) {
    throw new SimhostngProviderError(
      `SimHostNG HTTP ${response.status}${text ? `: ${text.slice(0, 220)}` : ""}`,
      `SIMHOSTNG_HTTP_${response.status}`,
      isTransientSmsHttpStatus(
        response.status,
      ),
    );
  }

  let parsed:
    unknown = null;

  try {
    parsed =
      JSON.parse(
        text,
      ) as unknown;
  } catch {
    // Some provider responses may be plain text.
  }

  const first =
    parsed &&
    typeof parsed ===
      "object" &&
    "data" in parsed &&
    Array.isArray(
      (
        parsed as {
          data?: unknown;
        }
      ).data,
    )
      ? (
          parsed as {
            data: Array<
              Record<
                string,
                unknown
              >
            >;
          }
        ).data[0]
      : null;

  const providerResponse =
    typeof first?.response ===
      "string"
      ? first.response.trim()
      : text;

  const providerId =
    typeof first?.id ===
      "string" &&
    first.id.trim()
      ? first.id.trim()
      : input.reference;

  if (
    providerResponse
      .toLowerCase() !==
    "ok"
  ) {
    throw new SimhostngProviderError(
      providerResponse
        ? `SimHostNG rejected the SMS: ${providerResponse.slice(0, 220)}`
        : "SimHostNG returned an empty delivery response.",
      "SIMHOSTNG_REJECTED",
      providerResponseIsTransient(
        providerResponse,
      ),
    );
  }

  return {
    messageId:
      providerId,
    providerResponse:
      providerResponse,
  };
}
