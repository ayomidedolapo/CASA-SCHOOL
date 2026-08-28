export interface PasskeyRpConfig {
  rpName: string;
  rpID: string;
  expectedOrigins:
    | string
    | string[];
}

export function getPasskeyRpConfig():
  PasskeyRpConfig {
  const rpName =
    process.env
      .CASA_WEBAUTHN_RP_NAME
      ?.trim() ||
    "CASA School";

  const configuredRpID =
    process.env
      .CASA_WEBAUTHN_RP_ID
      ?.trim();

  const configuredOrigins =
    process.env
      .CASA_WEBAUTHN_ORIGINS
      ?.split(",")
      .map(
        (value) =>
          value.trim(),
      )
      .filter(Boolean) ?? [];

  if (
    process.env.NODE_ENV ===
      "production" &&
    (
      !configuredRpID ||
      configuredOrigins.length === 0
    )
  ) {
    throw new Error(
      "PASSKEY_RP_NOT_CONFIGURED",
    );
  }

  const rpID =
    configuredRpID ||
    "localhost";

  const origins =
    configuredOrigins.length > 0
      ? configuredOrigins
      : [
          "http://localhost:3000",
        ];

  return {
    rpName,
    rpID,
    expectedOrigins:
      origins.length === 1
        ? origins[0]
        : origins,
  };
}