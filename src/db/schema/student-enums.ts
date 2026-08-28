import { pgEnum } from "drizzle-orm/pg-core";

export const studentStatusEnum =
  pgEnum("student_status", [
    "ACTIVE",
    "INACTIVE",
    "GRADUATED",
    "WITHDRAWN",
    "ARCHIVED",
  ]);

export const studentSexEnum =
  pgEnum("student_sex", [
    "MALE",
    "FEMALE",
    "UNSPECIFIED",
  ]);

export const guardianStatusEnum =
  pgEnum("guardian_status", [
    "ACTIVE",
    "INACTIVE",
    "ARCHIVED",
  ]);

export const enrollmentStatusEnum =
  pgEnum("student_enrollment_status", [
    "ACTIVE",
    "COMPLETED",
    "WITHDRAWN",
    "TRANSFERRED",
  ]);

export const studentIdentityCardStatusEnum =
  pgEnum("student_identity_card_status", [
    "ACTIVE",
    "LOST",
    "REVOKED",
    "REPLACED",
    "EXPIRED",
  ]);
export const studentIdentityCardEventTypeEnum =
  pgEnum(
    "student_identity_card_event_type",
    [
      "ISSUED",
      "MARKED_LOST",
      "REVOKED",
      "REPLACED",
      "EXPIRED",
    ],
  );