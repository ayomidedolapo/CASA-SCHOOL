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