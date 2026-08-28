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