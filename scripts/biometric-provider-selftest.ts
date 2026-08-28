import {
  evaluateBiometricVerification,
} from "../src/server/biometrics/policy";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) {
    throw new Error(message);
  }
}

const policy = {
  faceMinConfidenceBps:
    9000,
  livenessMinConfidenceBps:
    9200,
};

assert(
  evaluateBiometricVerification(
    {
      facePassed: true,
      faceConfidenceBps:
        9500,
      livenessPassed: true,
      livenessConfidenceBps:
        9600,
    },
    policy,
  ).accepted,
  "Expected strong face+liveness result to pass.",
);

assert(
  evaluateBiometricVerification(
    {
      facePassed: true,
      faceConfidenceBps:
        9500,
      livenessPassed: false,
      livenessConfidenceBps:
        9800,
    },
    policy,
  ).reason ===
    "LIVENESS_FAILED",
  "Liveness failure must reject.",
);

assert(
  evaluateBiometricVerification(
    {
      facePassed: true,
      faceConfidenceBps:
        8999,
      livenessPassed: true,
      livenessConfidenceBps:
        9600,
    },
    policy,
  ).reason ===
    "FACE_CONFIDENCE_BELOW_POLICY",
  "Face confidence threshold must be enforced.",
);

assert(
  evaluateBiometricVerification(
    {
      facePassed: true,
      faceConfidenceBps:
        9500,
      livenessPassed: true,
      livenessConfidenceBps:
        9199,
    },
    policy,
  ).reason ===
    "LIVENESS_CONFIDENCE_BELOW_POLICY",
  "Liveness confidence threshold must be enforced.",
);

assert(
  evaluateBiometricVerification(
    {
      facePassed: false,
      faceConfidenceBps:
        9999,
      livenessPassed: true,
      livenessConfidenceBps:
        9999,
    },
    policy,
  ).reason ===
    "FACE_MISMATCH",
  "Provider face mismatch must reject regardless of score.",
);

console.log(
  "CASA School biometric provider-policy self-test passed.",
);