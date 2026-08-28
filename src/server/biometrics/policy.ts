export interface BiometricThresholdPolicy {
  faceMinConfidenceBps: number;
  livenessMinConfidenceBps: number;
}

function readThreshold(
  name: string,
): number {
  const raw =
    process.env[name]?.trim();

  if (!raw) {
    throw new Error(
      "BIOMETRIC_POLICY_NOT_CONFIGURED",
    );
  }

  const value =
    Number(raw);

  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value > 10000
  ) {
    throw new Error(
      "BIOMETRIC_POLICY_INVALID",
    );
  }

  return value;
}

export function getBiometricThresholdPolicy():
  BiometricThresholdPolicy {
  return {
    faceMinConfidenceBps:
      readThreshold(
        "CASA_BIOMETRIC_FACE_MIN_CONFIDENCE_BPS",
      ),
    livenessMinConfidenceBps:
      readThreshold(
        "CASA_BIOMETRIC_LIVENESS_MIN_CONFIDENCE_BPS",
      ),
  };
}

export interface ProviderVerificationDecision {
  accepted: boolean;
  reason:
    | null
    | "FACE_MISMATCH"
    | "FACE_CONFIDENCE_BELOW_POLICY"
    | "LIVENESS_FAILED"
    | "LIVENESS_CONFIDENCE_BELOW_POLICY";
}

export function evaluateBiometricVerification(
  input: {
    facePassed: boolean;
    faceConfidenceBps: number;
    livenessPassed: boolean;
    livenessConfidenceBps: number;
  },
  policy:
    BiometricThresholdPolicy,
): ProviderVerificationDecision {
  if (!input.livenessPassed) {
    return {
      accepted: false,
      reason:
        "LIVENESS_FAILED",
    };
  }

  if (
    input.livenessConfidenceBps <
    policy.livenessMinConfidenceBps
  ) {
    return {
      accepted: false,
      reason:
        "LIVENESS_CONFIDENCE_BELOW_POLICY",
    };
  }

  if (!input.facePassed) {
    return {
      accepted: false,
      reason:
        "FACE_MISMATCH",
    };
  }

  if (
    input.faceConfidenceBps <
    policy.faceMinConfidenceBps
  ) {
    return {
      accepted: false,
      reason:
        "FACE_CONFIDENCE_BELOW_POLICY",
    };
  }

  return {
    accepted: true,
    reason: null,
  };
}