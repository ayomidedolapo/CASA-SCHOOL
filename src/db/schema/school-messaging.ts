import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  schoolMessagingSenderStatusEnum,
  schoolNotificationDeliveryStatusEnum,
  schoolNotificationEventTypeEnum,
} from "./messaging-enums";
import { guardians } from "./guardians";
import { schools } from "./schools";
import {
  studentAttendanceRecords,
  studentPresenceEvents,
} from "./attendance";
import {
  schoolMemberships,
} from "./users";

export const schoolWhatsappSenders =
  pgTable(
    "school_whatsapp_senders",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      displayPhoneNumber: varchar(
        "display_phone_number",
        {
          length: 32,
        },
      ).notNull(),
      verifiedName: varchar(
        "verified_name",
        {
          length: 160,
        },
      ),
      providerBusinessAccountId:
        varchar(
          "provider_business_account_id",
          {
            length: 120,
          },
        ),
      providerPhoneNumberId:
        varchar(
          "provider_phone_number_id",
          {
            length: 120,
          },
        ),
      providerConnectionRef:
        varchar(
          "provider_connection_ref",
          {
            length: 200,
          },
        ),
      status:
        schoolMessagingSenderStatusEnum(
          "status",
        )
          .default("PENDING_SETUP")
          .notNull(),
      createdByMembershipId:
        uuid(
          "created_by_membership_id",
        ).notNull(),
      activatedAt: timestamp(
        "activated_at",
        {
          withTimezone: true,
        },
      ),
      revokedAt: timestamp(
        "revoked_at",
        {
          withTimezone: true,
        },
      ),
      createdAt: timestamp(
        "created_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
      updatedAt: timestamp(
        "updated_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
    },
    (table) => [
      unique(
        "school_whatsapp_senders_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      uniqueIndex(
        "school_whatsapp_senders_one_active_per_school_idx",
      )
        .on(
          table.schoolId,
        )
        .where(
          sql`${table.status} = 'ACTIVE'`,
        ),
      uniqueIndex(
        "school_whatsapp_senders_provider_phone_unique_idx",
      )
        .on(
          table.providerPhoneNumberId,
        )
        .where(
          sql`${table.providerPhoneNumberId} is not null`,
        ),
      index(
        "school_whatsapp_senders_school_status_idx",
      ).on(
        table.schoolId,
        table.status,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.createdByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "school_whatsapp_senders_school_creator_fk",
      }),
      check(
        "school_whatsapp_senders_phone_not_blank_check",
        sql`length(trim(${table.displayPhoneNumber})) > 0`,
      ),
      check(
        "school_whatsapp_senders_active_provider_identity_check",
        sql`${table.status} <> 'ACTIVE' or (
          ${table.providerBusinessAccountId} is not null
          and ${table.providerPhoneNumberId} is not null
          and ${table.providerConnectionRef} is not null
          and ${table.activatedAt} is not null
        )`,
      ),
      check(
        "school_whatsapp_senders_revoke_timestamp_check",
        sql`${table.status} <> 'REVOKED' or ${table.revokedAt} is not null`,
      ),
    ],
  );

export const schoolNotificationOutbox =
  pgTable(
    "school_notification_outbox",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      attendanceRecordId: uuid(
        "attendance_record_id",
      ).notNull(),
      presenceEventId: uuid(
        "presence_event_id",
      ).notNull(),
      guardianId: uuid(
        "guardian_id",
      ).notNull(),
      senderId: uuid(
        "sender_id",
      ).notNull(),
      eventType:
        schoolNotificationEventTypeEnum(
          "event_type",
        ).notNull(),
      recipientPhone: varchar(
        "recipient_phone",
        {
          length: 32,
        },
      ).notNull(),
      templateKey: varchar(
        "template_key",
        {
          length: 100,
        },
      ).notNull(),
      payload: jsonb(
        "payload",
      ).notNull(),
      status:
        schoolNotificationDeliveryStatusEnum(
          "status",
        )
          .default("PENDING")
          .notNull(),
      attemptCount: integer(
        "attempt_count",
      )
        .default(0)
        .notNull(),
      availableAt: timestamp(
        "available_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
      lockedAt: timestamp(
        "locked_at",
        {
          withTimezone: true,
        },
      ),
      sentAt: timestamp(
        "sent_at",
        {
          withTimezone: true,
        },
      ),
      providerMessageId: varchar(
        "provider_message_id",
        {
          length: 180,
        },
      ),
      lastErrorCode: varchar(
        "last_error_code",
        {
          length: 80,
        },
      ),
      lastErrorMessage: varchar(
        "last_error_message",
        {
          length: 500,
        },
      ),
      createdAt: timestamp(
        "created_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
      updatedAt: timestamp(
        "updated_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
    },
    (table) => [
      unique(
        "school_notification_outbox_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "school_notification_outbox_event_guardian_sender_unique",
      ).on(
        table.schoolId,
        table.presenceEventId,
        table.guardianId,
        table.senderId,
      ),
      index(
        "school_notification_outbox_work_idx",
      ).on(
        table.status,
        table.availableAt,
      ),
      index(
        "school_notification_outbox_school_created_idx",
      ).on(
        table.schoolId,
        table.createdAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.attendanceRecordId,
        ],
        foreignColumns: [
          studentAttendanceRecords.schoolId,
          studentAttendanceRecords.id,
        ],
        name: "school_notification_outbox_school_record_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.presenceEventId,
        ],
        foreignColumns: [
          studentPresenceEvents.schoolId,
          studentPresenceEvents.id,
        ],
        name: "school_notification_outbox_school_presence_event_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.guardianId,
        ],
        foreignColumns: [
          guardians.schoolId,
          guardians.id,
        ],
        name: "school_notification_outbox_school_guardian_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.senderId,
        ],
        foreignColumns: [
          schoolWhatsappSenders.schoolId,
          schoolWhatsappSenders.id,
        ],
        name: "school_notification_outbox_school_sender_fk",
      }),
      check(
        "school_notification_outbox_recipient_phone_not_blank_check",
        sql`length(trim(${table.recipientPhone})) > 0`,
      ),
      check(
        "school_notification_outbox_template_key_not_blank_check",
        sql`length(trim(${table.templateKey})) > 0`,
      ),
      check(
        "school_notification_outbox_attempt_count_check",
        sql`${table.attemptCount} >= 0`,
      ),
      check(
        "school_notification_outbox_sent_state_check",
        sql`${table.status} <> 'SENT' or ${table.sentAt} is not null`,
      ),
    ],
  );