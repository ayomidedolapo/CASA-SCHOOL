// CASA_PHASE_3K_PASSKEY_REGISTRATION_UI
"use client";

import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/browser";

interface JsonBody {
  [key: string]: unknown;
}

export interface RegisteredPasskey {
  id: string;
  label?: string | null;
  deviceType?: string | null;
  backedUp?: boolean | null;
  transports?: string[] | null;
  createdAt?: string | null;
  lastUsedAt?: string | null;
}

function messageFromBody(body: unknown, fallback: string) {
  if (
    body &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as { message?: unknown }).message === "string"
  ) {
    return (body as { message: string }).message;
  }
  return fallback;
}

function registrationOptionsFromBody(
  body: JsonBody,
): PublicKeyCredentialCreationOptionsJSON {
  const candidate =
    body.options ??
    body.registrationOptions ??
    body.publicKey ??
    body;

  return candidate as PublicKeyCredentialCreationOptionsJSON;
}

export async function listPasskeys(): Promise<RegisteredPasskey[]> {
  const response = await fetch("/api/auth/passkeys", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as JsonBody;

  if (!response.ok) {
    throw new Error(
      messageFromBody(body, "Passkey status could not be loaded."),
    );
  }

  return Array.isArray(body.passkeys)
    ? (body.passkeys as RegisteredPasskey[])
    : [];
}

export async function registerPasskey(input?: {
  label?: string;
}): Promise<RegisteredPasskey | null> {
  const optionsResponse = await fetch(
    "/api/auth/passkeys/register/options",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  const optionsBody = (await optionsResponse
    .json()
    .catch(() => ({}))) as JsonBody;

  if (!optionsResponse.ok) {
    throw new Error(
      messageFromBody(
        optionsBody,
        "Passkey registration could not be started.",
      ),
    );
  }

  const ceremonyId =
    typeof optionsBody.ceremonyId === "string"
      ? optionsBody.ceremonyId
      : "";

  if (!ceremonyId) {
    throw new Error(
      "CASA did not return a Passkey registration ceremony identifier.",
    );
  }

  const response = await startRegistration({
    optionsJSON: registrationOptionsFromBody(optionsBody),
  });

  const verifyResponse = await fetch(
    "/api/auth/passkeys/register/verify",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ceremonyId,
        response,
        label: input?.label?.trim() || undefined,
      }),
    },
  );

  const verifyBody = (await verifyResponse
    .json()
    .catch(() => ({}))) as JsonBody;

  if (!verifyResponse.ok) {
    throw new Error(
      messageFromBody(
        verifyBody,
        "Passkey registration could not be completed.",
      ),
    );
  }

  const passkey =
    verifyBody.passkey &&
    typeof verifyBody.passkey === "object"
      ? (verifyBody.passkey as RegisteredPasskey)
      : null;

  return passkey;
}
