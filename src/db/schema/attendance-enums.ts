import { pgEnum } from "drizzle-orm/pg-core";

export const attendanceTerminalStatusEnum =
  pgEnum(
    "attendance_terminal_status",
    [
      "ACTIVE",
      "SUSPENDED",
      "REVOKED",
    ],
  );

export const attendanceSessionStatusEnum =
  pgEnum(
    "attendance_session_status",
    [
      "PLANNED",
      "OPEN",
      "CLOSED",
      "CANCELLED",
    ],
  );

export const attendanceCardResultEnum =
  pgEnum(
    "attendance_card_result",
    [
      "PENDING",
      "MATCHED",
      "UNKNOWN_CARD",
      "INACTIVE_CARD",
    ],
  );

export const attendanceFaceResultEnum =
  pgEnum(
    "attendance_face_result",
    [
      "NOT_RUN",
      "PASSED",
      "FAILED",
      "UNAVAILABLE",
    ],
  );

export const attendanceLivenessResultEnum =
  pgEnum(
    "attendance_liveness_result",
    [
      "NOT_RUN",
      "PASSED",
      "FAILED",
      "UNAVAILABLE",
    ],
  );

export const attendanceTimeResultEnum =
  pgEnum(
    "attendance_time_result",
    [
      "NOT_RUN",
      "ON_TIME",
      "LATE",
      "OUTSIDE_WINDOW",
    ],
  );

export const attendanceAttemptOutcomeEnum =
  pgEnum(
    "attendance_attempt_outcome",
    [
      "PENDING",
      "RECORDED",
      "REJECTED",
      "MANUAL_REVIEW",
    ],
  );

export const attendanceRecordStatusEnum =
  pgEnum(
    "attendance_record_status",
    [
      "ON_TIME",
      "LATE",
      "MANUAL",
    ],
  );