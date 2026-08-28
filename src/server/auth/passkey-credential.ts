import type {
  AuthenticatorTransportFuture,
  WebAuthnCredential,
} from "@simplewebauthn/server";

export function encodePasskeyPublicKey(
  value: Uint8Array,
): string {
  return Buffer.from(
    value,
  ).toString(
    "base64url",
  );
}

export function decodePasskeyPublicKey(
  value: string,
): WebAuthnCredential["publicKey"] {
  const source =
    Buffer.from(
      value,
      "base64url",
    );

  const publicKey:
    WebAuthnCredential["publicKey"] =
      new Uint8Array(
        source.byteLength,
      );

  publicKey.set(source);

  return publicKey;
}

export function parseStoredTransports(
  value: unknown,
): AuthenticatorTransportFuture[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (
      item,
    ): item is
      AuthenticatorTransportFuture =>
      typeof item ===
        "string",
  );
}

export function toWebAuthnCredential(
  passkey: {
    credentialId: string;
    publicKeyBase64url: string;
    counter: number;
    transports: unknown;
  },
): WebAuthnCredential {
  return {
    id:
      passkey.credentialId,
    publicKey:
      decodePasskeyPublicKey(
        passkey.publicKeyBase64url,
      ),
    counter:
      passkey.counter,
    transports:
      parseStoredTransports(
        passkey.transports,
      ),
  };
}