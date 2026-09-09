import {
  pgEnum,
} from "drizzle-orm/pg-core";

export const schoolAttendanceLifecycleStatusEnum =
  pgEnum(
    "school_attendance_lifecycle_status",
    [
      "SETUP",
      "READY",
      "ACTIVE",
      "PAUSED",
    ],
  );

export const schoolAttendanceLifecycleEventTypeEnum =
  pgEnum(
    "school_attendance_lifecycle_event_type",
    [
      "MARKED_READY",
      "ACTIVATED",
      "PAUSED",
      "RESUME_SCHEDULED",
      "RESUME_SCHEDULE_CANCELLED",
      "RESUMED",
    ],
  );

export const studentCardReplacementCaseStatusEnum =
  pgEnum(
    "student_card_replacement_case_status",
    [
      "CARD_REPLACEMENT_PENDING",
      "COMPLETED",
      "CANCELLED",
    ],
  );

export const studentCardAttendanceExceptionVerificationEnum =
  pgEnum(
    "student_card_attendance_exception_verification",
    [
      "FACE_EXISTING_PROFILE",
    ],
  );
