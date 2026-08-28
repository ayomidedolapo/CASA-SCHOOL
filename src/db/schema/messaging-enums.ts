import { pgEnum } from "drizzle-orm/pg-core";

export const schoolMessagingSenderStatusEnum =
  pgEnum(
    "school_messaging_sender_status",
    [
      "PENDING_SETUP",
      "ACTIVE",
      "SUSPENDED",
      "REVOKED",
    ],
  );

export const schoolNotificationEventTypeEnum =
  pgEnum(
    "school_notification_event_type",
    [
      "STUDENT_CHECKED_IN",
      "STUDENT_SIGNED_OUT",
      "STUDENT_EARLY_DEPARTURE",
    ],
  );

export const schoolNotificationDeliveryStatusEnum =
  pgEnum(
    "school_notification_delivery_status",
    [
      "PENDING",
      "PROCESSING",
      "RETRY",
      "SENT",
      "FAILED",
      "CANCELLED",
    ],
  );