"use client";

import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

async function obtainPasskeyStepUpGrantFromBase(
  input: {
    basePath: string;
    action: string;
  },
): Promise<string> {
  const optionsResponse =
    await fetch(
      `${input.basePath}/options`,
      {
        method:
          "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        credentials:
          "same-origin",
        cache:
          "no-store",
        body:
          JSON.stringify({
            action:
              input.action,
          }),
      },
    );

  const optionsBody =
    await optionsResponse.json();

  if (
    !optionsResponse.ok ||
    !optionsBody
      ?.ceremonyId ||
    !optionsBody
      ?.options
  ) {
    throw new Error(
      optionsBody?.message ??
        "Passkey authorization could not be started.",
    );
  }

  const response =
    await startAuthentication({
      optionsJSON:
        optionsBody.options as
          PublicKeyCredentialRequestOptionsJSON,
    });

  const verifyResponse =
    await fetch(
      `${input.basePath}/verify`,
      {
        method:
          "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        credentials:
          "same-origin",
        cache:
          "no-store",
        body:
          JSON.stringify({
            ceremonyId:
              optionsBody.ceremonyId,
            action:
              input.action,
            response,
          }),
      },
    );

  const verifyBody =
    await verifyResponse.json();

  if (
    !verifyResponse.ok ||
    !verifyBody
      ?.grant
      ?.token
  ) {
    throw new Error(
      verifyBody?.message ??
        "Passkey authorization failed.",
    );
  }

  return verifyBody.grant.token;
}

export async function obtainPasskeyStepUpGrant(
  input: {
    schoolSlug: string;
    action: string;
  },
): Promise<string> {
  return obtainPasskeyStepUpGrantFromBase({
    basePath:
      `/api/schools/${encodeURIComponent(
        input.schoolSlug,
      )}/auth/passkey/step-up`,
    action:
      input.action,
  });
}

export async function obtainCasaInternalPasskeyStepUpGrant(
  input: {
    schoolId: string;
    action:
      | "BIOMETRIC_ENROLL"
      | "BIOMETRIC_REENROLL";
  },
): Promise<string> {
  return obtainPasskeyStepUpGrantFromBase({
    basePath:
      `/api/internal/onboarding/schools/${encodeURIComponent(
        input.schoolId,
      )}/auth/passkey/step-up`,
    action:
      input.action,
  });
}
