import {
  pgEnum,
} from "drizzle-orm/pg-core";

export const attendanceSessionEventTypeEnum =
  pgEnum(
    "attendance_session_event_type",
    [
      "CREATED",
      "OPENED",
      "CLOSED",
    ],
  );