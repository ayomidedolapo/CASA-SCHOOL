import { pgEnum } from "drizzle-orm/pg-core";

export const studentBiometricProfileStatusEnum =
  pgEnum(
    "student_biometric_profile_status",
    [
      "ACTIVE",
      "SUSPENDED",
      "REVOKED",
    ],
  );
export const studentBiometricProfileEventTypeEnum =
  pgEnum(
    "student_biometric_profile_event_type",
    [
      "ENROLLED",
      "REENROLLED",
      "SUSPENDED",
      "REVOKED",
    ],
  );
export const biometricLivenessPurposeEnum =
  pgEnum(
    "biometric_liveness_purpose",
    [
      "ENROLLMENT",
      "VERIFICATION",
    ],
  );

export const biometricLivenessStatusEnum =
  pgEnum(
    "biometric_liveness_status",
    [
      "CREATED",
      "COMPLETED",
      "FAILED",
      "EXPIRED",
    ],
  );

export const biometricProviderCleanupStatusEnum =
  pgEnum(
    "biometric_provider_cleanup_status",
    [
      "PENDING",
      "DONE",
    ],
  );