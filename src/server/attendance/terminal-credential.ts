import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export const TERMINAL_TOKEN_PREFIX =
  "CASAT1";

const terminalSecretPattern =
  /^[A-Za-z0-9_-]{43}$/;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface TerminalCredential {
  terminalId: string;
  terminalCode: string;
  secret: string;
  secretHash: string;
  token: string;
}

export function hashTerminalSecret(
  secret: string,
): string {
  return createHash("sha256")
    .update(secret, "utf8")
    .digest("hex");
}

export function createTerminalCredential():
  TerminalCredential {
  const terminalId =
    randomUUID();

  const secret =
    randomBytes(32).toString(
      "base64url",
    );

  const terminalCode =
    `CST-${randomBytes(6)
      .toString("hex")
      .toUpperCase()}`;

  return {
    terminalId,
    terminalCode,
    secret,
    secretHash:
      hashTerminalSecret(secret),
    token:
      `${TERMINAL_TOKEN_PREFIX}.${terminalId}.${secret}`,
  };
}

export function createRotatedTerminalSecret(
  terminalId: string,
): {
  secret: string;
  secretHash: string;
  token: string;
} {
  if (!uuidPattern.test(terminalId)) {
    throw new Error(
      "Invalid terminal identifier.",
    );
  }

  const secret =
    randomBytes(32).toString(
      "base64url",
    );

  return {
    secret,
    secretHash:
      hashTerminalSecret(secret),
    token:
      `${TERMINAL_TOKEN_PREFIX}.${terminalId}.${secret}`,
  };
}

export function parseTerminalToken(
  value: string,
): {
  terminalId: string;
  secret: string;
} | null {
  const parts =
    value.split(".");

  if (
    parts.length !== 3 ||
    parts[0] !==
      TERMINAL_TOKEN_PREFIX ||
    !uuidPattern.test(parts[1] ?? "") ||
    !terminalSecretPattern.test(
      parts[2] ?? "",
    )
  ) {
    return null;
  }

  return {
    terminalId:
      parts[1],
    secret:
      parts[2],
  };
}

export function terminalSecretMatches(
  secret: string,
  expectedHash: string,
): boolean {
  if (
    !/^[0-9a-f]{64}$/.test(
      expectedHash,
    )
  ) {
    return false;
  }

  const actual =
    Buffer.from(
      hashTerminalSecret(secret),
      "hex",
    );

  const expected =
    Buffer.from(
      expectedHash,
      "hex",
    );

  return timingSafeEqual(
    actual,
    expected,
  );
}