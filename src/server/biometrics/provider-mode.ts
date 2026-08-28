export type BiometricProviderMode =
  | "HTTP_GATEWAY"
  | "AWS_REKOGNITION";

export function getBiometricProviderMode():
  BiometricProviderMode {
  const value =
    process.env
      .CASA_BIOMETRIC_PROVIDER_MODE
      ?.trim()
      .toUpperCase();

  if (
    value ===
      "HTTP_GATEWAY" ||
    value ===
      "AWS_REKOGNITION"
  ) {
    return value;
  }

  throw new Error(
    "BIOMETRIC_PROVIDER_MODE_NOT_CONFIGURED",
  );
}

export function assertBiometricProviderMode(
  expected:
    BiometricProviderMode,
): void {
  if (
    getBiometricProviderMode() !==
      expected
  ) {
    throw new Error(
      "BIOMETRIC_PROVIDER_MODE_MISMATCH",
    );
  }
}