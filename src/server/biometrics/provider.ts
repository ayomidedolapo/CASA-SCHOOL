import { z } from "zod";

const enrollmentResponseSchema =
  z.object({
    provider:
      z.string().trim().min(1).max(80),
    subjectRef:
      z.string().trim().min(1).max(180),
    enrollmentId:
      z.string().trim().min(1).max(180),
    liveness: z.object({
      passed:
        z.boolean(),
      confidenceBps:
        z.number().int().min(0).max(10000),
    }),
  });

const verificationResponseSchema =
  z.object({
    provider:
      z.string().trim().min(1).max(80),
    verificationId:
      z.string().trim().min(1).max(180),
    face: z.object({
      passed:
        z.boolean(),
      confidenceBps:
        z.number().int().min(0).max(10000),
    }),
    liveness: z.object({
      passed:
        z.boolean(),
      confidenceBps:
        z.number().int().min(0).max(10000),
    }),
  });

export type BiometricEnrollmentResult =
  z.infer<
    typeof enrollmentResponseSchema
  >;

export type BiometricVerificationResult =
  z.infer<
    typeof verificationResponseSchema
  >;

interface BiometricProviderConfig {
  baseUrl: URL;
  apiKey: string;
  provider: string;
}

export class BiometricProviderUnavailableError extends Error {
  constructor(
    message:
      string =
        "Biometric provider unavailable.",
  ) {
    super(message);
    this.name =
      "BiometricProviderUnavailableError";
  }
}

function getBiometricProviderConfig():
  BiometricProviderConfig {
  const baseUrlRaw =
    process.env
      .CASA_BIOMETRIC_PROVIDER_BASE_URL
      ?.trim();

  const apiKey =
    process.env
      .CASA_BIOMETRIC_PROVIDER_API_KEY
      ?.trim();

  const provider =
    process.env
      .CASA_BIOMETRIC_PROVIDER_NAME
      ?.trim();

  if (
    !baseUrlRaw ||
    !apiKey ||
    !provider
  ) {
    throw new Error(
      "BIOMETRIC_PROVIDER_NOT_CONFIGURED",
    );
  }

  let baseUrl: URL;

  try {
    baseUrl =
      new URL(baseUrlRaw);
  } catch {
    throw new Error(
      "BIOMETRIC_PROVIDER_INVALID_CONFIGURATION",
    );
  }

  if (
    baseUrl.username ||
    baseUrl.password
  ) {
    throw new Error(
      "BIOMETRIC_PROVIDER_INVALID_CONFIGURATION",
    );
  }

  const localhost =
    baseUrl.hostname ===
      "localhost" ||
    baseUrl.hostname ===
      "127.0.0.1" ||
    baseUrl.hostname ===
      "::1";

  if (
    process.env.NODE_ENV ===
      "production" &&
    baseUrl.protocol !== "https:"
  ) {
    throw new Error(
      "BIOMETRIC_PROVIDER_HTTPS_REQUIRED",
    );
  }

  if (
    baseUrl.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !==
        "production" &&
      localhost &&
      baseUrl.protocol ===
        "http:"
    )
  ) {
    throw new Error(
      "BIOMETRIC_PROVIDER_INVALID_CONFIGURATION",
    );
  }

  return {
    baseUrl,
    apiKey,
    provider,
  };
}

async function callProvider(
  path: string,
  body: FormData,
): Promise<unknown> {
  const config =
    getBiometricProviderConfig();

  const endpoint =
    new URL(
      path,
      config.baseUrl,
    );

  let response: Response;

  try {
    response =
      await fetch(
        endpoint,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${config.apiKey}`,
            Accept:
              "application/json",
          },
          body,
          redirect:
            "error",
          signal:
            AbortSignal.timeout(
              20_000,
            ),
        },
      );
  } catch {
    throw new BiometricProviderUnavailableError();
  }

  if (!response.ok) {
    throw new BiometricProviderUnavailableError(
      `Biometric provider returned HTTP ${response.status}.`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new BiometricProviderUnavailableError(
      "Biometric provider returned invalid JSON.",
    );
  }
}

export async function enrollBiometricSubject(
  input: {
    schoolId: string;
    studentId: string;
    requestId: string;
    capture: File;
  },
): Promise<BiometricEnrollmentResult> {
  const config =
    getBiometricProviderConfig();

  const body =
    new FormData();

  body.set(
    "schoolId",
    input.schoolId,
  );
  body.set(
    "studentId",
    input.studentId,
  );
  body.set(
    "requestId",
    input.requestId,
  );
  body.set(
    "capture",
    input.capture,
    input.capture.name ||
      "capture",
  );

  const raw =
    await callProvider(
      "/v1/enroll",
      body,
    );

  const parsed =
    enrollmentResponseSchema.safeParse(
      raw,
    );

  if (
    !parsed.success ||
    parsed.data.provider !==
      config.provider
  ) {
    throw new BiometricProviderUnavailableError(
      "Biometric enrollment response failed contract validation.",
    );
  }

  return parsed.data;
}

export async function verifyBiometricSubject(
  input: {
    schoolId: string;
    studentId: string;
    attemptId: string;
    subjectRef: string;
    capture: File;
  },
): Promise<BiometricVerificationResult> {
  const config =
    getBiometricProviderConfig();

  const body =
    new FormData();

  body.set(
    "schoolId",
    input.schoolId,
  );
  body.set(
    "studentId",
    input.studentId,
  );
  body.set(
    "attemptId",
    input.attemptId,
  );
  body.set(
    "subjectRef",
    input.subjectRef,
  );
  body.set(
    "capture",
    input.capture,
    input.capture.name ||
      "capture",
  );

  const raw =
    await callProvider(
      "/v1/verify",
      body,
    );

  const parsed =
    verificationResponseSchema.safeParse(
      raw,
    );

  if (
    !parsed.success ||
    parsed.data.provider !==
      config.provider
  ) {
    throw new BiometricProviderUnavailableError(
      "Biometric verification response failed contract validation.",
    );
  }

  return parsed.data;
}