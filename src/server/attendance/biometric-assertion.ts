import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

export const BIOMETRIC_ASSERTION_PREFIX =
  "CASABIO1";

const assertionPayloadSchema =
  z.object({
    version: z.literal(1),
    assertionId: z
      .string()
      .regex(
        /^[A-Za-z0-9_-]{16,64}$/,
      ),
    attemptId: z
      .string()
      .uuid(),
    studentId: z
      .string()
      .uuid(),
    profileId: z
      .string()
      .uuid(),
    provider: z
      .string()
      .trim()
      .min(1)
      .max(80),
    providerVerificationId: z
      .string()
      .trim()
      .min(1)
      .max(180),
    faceResult:
      z.literal("PASSED"),
    livenessResult:
      z.literal("PASSED"),
    faceConfidenceBps: z
      .number()
      .int()
      .min(0)
      .max(10000),
    livenessConfidenceBps: z
      .number()
      .int()
      .min(0)
      .max(10000),
    issuedAt: z
      .string()
      .datetime({
        offset: true,
      }),
    expiresAt: z
      .string()
      .datetime({
        offset: true,
      }),
  });

export type BiometricAssertionPayload =
  z.infer<
    typeof assertionPayloadSchema
  >;

function decodeSecret(
  secret: string,
): Buffer {
  let decoded: Buffer;

  try {
    decoded =
      Buffer.from(
        secret,
        "base64url",
      );
  } catch {
    throw new Error(
      "Invalid biometric assertion secret encoding.",
    );
  }

  if (decoded.length < 32) {
    throw new Error(
      "Biometric assertion secret must contain at least 256 bits.",
    );
  }

  return decoded;
}

function signEncodedPayload(
  encodedPayload: string,
  secret: string,
): string {
  return createHmac(
    "sha256",
    decodeSecret(secret),
  )
    .update(
      `${BIOMETRIC_ASSERTION_PREFIX}.${encodedPayload}`,
      "utf8",
    )
    .digest(
      "base64url",
    );
}

export function createBiometricAssertion(
  payload:
    BiometricAssertionPayload,
  secret: string,
): string {
  const parsed =
    assertionPayloadSchema.parse(
      payload,
    );

  const encodedPayload =
    Buffer.from(
      JSON.stringify(parsed),
      "utf8",
    ).toString(
      "base64url",
    );

  const signature =
    signEncodedPayload(
      encodedPayload,
      secret,
    );

  return `${BIOMETRIC_ASSERTION_PREFIX}.${encodedPayload}.${signature}`;
}

export function verifyBiometricAssertion(
  token: string,
  secret: string,
  now = new Date(),
): BiometricAssertionPayload {
  const parts =
    token.split(".");

  if (
    parts.length !== 3 ||
    parts[0] !==
      BIOMETRIC_ASSERTION_PREFIX
  ) {
    throw new Error(
      "Invalid biometric assertion.",
    );
  }

  const encodedPayload =
    parts[1] ?? "";

  const signature =
    parts[2] ?? "";

  const expectedSignature =
    signEncodedPayload(
      encodedPayload,
      secret,
    );

  if (
    !/^[A-Za-z0-9_-]{43}$/.test(
      signature,
    )
  ) {
    throw new Error(
      "Invalid biometric assertion signature.",
    );
  }

  const actual =
    Buffer.from(
      signature,
      "utf8",
    );

  const expected =
    Buffer.from(
      expectedSignature,
      "utf8",
    );

  if (
    actual.length !==
      expected.length ||
    !timingSafeEqual(
      actual,
      expected,
    )
  ) {
    throw new Error(
      "Invalid biometric assertion signature.",
    );
  }

  let decoded: unknown;

  try {
    decoded =
      JSON.parse(
        Buffer.from(
          encodedPayload,
          "base64url",
        ).toString(
          "utf8",
        ),
      );
  } catch {
    throw new Error(
      "Invalid biometric assertion payload.",
    );
  }

  const payload =
    assertionPayloadSchema.parse(
      decoded,
    );

  const issuedAt =
    new Date(payload.issuedAt);

  const expiresAt =
    new Date(payload.expiresAt);

  const nowMs =
    now.getTime();

  if (
    issuedAt.getTime() >
      nowMs + 30_000
  ) {
    throw new Error(
      "Biometric assertion was issued in the future.",
    );
  }

  if (
    expiresAt.getTime() <=
      nowMs
  ) {
    throw new Error(
      "Biometric assertion expired.",
    );
  }

  if (
    expiresAt.getTime() <=
      issuedAt.getTime() ||
    expiresAt.getTime() -
      issuedAt.getTime() >
      120_000
  ) {
    throw new Error(
      "Biometric assertion lifetime is invalid.",
    );
  }

  return payload;
}

export function verifyBiometricAssertionFromEnvironment(
  token: string,
  now = new Date(),
): BiometricAssertionPayload {
  const secret =
    process.env
      .CASA_BIOMETRIC_ASSERTION_HMAC_SECRET;

  if (!secret) {
    throw new Error(
      "BIOMETRIC_ASSERTION_NOT_CONFIGURED",
    );
  }

  return verifyBiometricAssertion(
    token,
    secret,
    now,
  );
}