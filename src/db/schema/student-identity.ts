import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { schools } from "./schools";
import { students } from "./students";
import { schoolMemberships } from "./users";
import {
  studentIdentityCardEventTypeEnum,
  studentIdentityCardStatusEnum,
} from "./student-enums";

export const studentIdentityCards =
  pgTable(
    "student_identity_cards",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      studentId: uuid("student_id")
        .notNull(),
      serialNumber: varchar(
        "serial_number",
        {
          length: 64,
        },
      ).notNull(),
      tokenHash: varchar(
        "token_hash",
        {
          length: 64,
        },
      ).notNull(),
      status:
        studentIdentityCardStatusEnum(
          "status",
        )
          .default("READY_FOR_ACTIVATION")
          .notNull(),
      issuedAt: timestamp(
        "issued_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
      expiresAt: timestamp(
        "expires_at",
        {
          withTimezone: true,
        },
      ),
      deactivatedAt: timestamp(
        "deactivated_at",
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
        "student_identity_cards_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "student_identity_cards_school_serial_unique",
      ).on(
        table.schoolId,
        table.serialNumber,
      ),
      unique(
        "student_identity_cards_token_hash_unique",
      ).on(
        table.tokenHash,
      ),
      uniqueIndex(
        "student_identity_cards_one_active_per_student_idx",
      )
        .on(
          table.schoolId,
          table.studentId,
        )
        .where(
          sql`${table.status} = 'ACTIVE'`,
        ),
      uniqueIndex(
        "student_identity_cards_one_pending_activation_per_student_idx",
      )
        .on(
          table.schoolId,
          table.studentId,
        )
        .where(
          sql`${table.status} = 'READY_FOR_ACTIVATION'`,
        ),
      index(
        "student_identity_cards_student_status_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.status,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.studentId,
        ],
        foreignColumns: [
          students.schoolId,
          students.id,
        ],
        name: "student_identity_cards_school_student_fk",
      }),
      check(
        "student_identity_cards_serial_not_blank_check",
        sql`length(trim(${table.serialNumber})) > 0`,
      ),
      check(
        "student_identity_cards_token_hash_format_check",
        sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
      ),
      check(
        "student_identity_cards_expiry_after_issue_check",
        sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.issuedAt}`,
      ),
    ],
  );
export const studentIdentityCardEvents =
  pgTable(
    "student_identity_card_events",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid("school_id")
        .notNull()
        .references(
          () => schools.id,
        ),
      studentId: uuid("student_id")
        .notNull(),
      cardId: uuid("card_id")
        .notNull(),
      actorKind: varchar(

        "actor_kind",

        {

          length: 32,

        },

      )

        .$type<

          | "SCHOOL_MEMBER"

          | "CASA_INTERNAL"

        >()

        .default(

          "SCHOOL_MEMBER",

        )

        .notNull(),

      actorMembershipId: uuid(
        "actor_membership_id",
      ),
      eventType:
        studentIdentityCardEventTypeEnum(
          "event_type",
        ).notNull(),
      reason: varchar("reason", {
        length: 240,
      }),
      createdAt: timestamp(
        "created_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
    },
    (table) => [
      unique(
        "student_identity_card_events_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      index(
        "student_identity_card_events_student_created_idx",
      ).on(
        table.schoolId,
        table.studentId,
        table.createdAt,
      ),
      index(
        "student_identity_card_events_card_created_idx",
      ).on(
        table.schoolId,
        table.cardId,
        table.createdAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.studentId,
        ],
        foreignColumns: [
          students.schoolId,
          students.id,
        ],
        name: "student_identity_card_events_school_student_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.cardId,
        ],
        foreignColumns: [
          studentIdentityCards.schoolId,
          studentIdentityCards.id,
        ],
        name: "student_identity_card_events_school_card_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.actorMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "student_identity_card_events_school_actor_membership_fk",
      }),
      check(
        "student_identity_card_events_reason_not_blank_check",
        sql`${table.reason} is null or length(trim(${table.reason})) > 0`,
      ),
    index(
      "student_identity_card_events_actor_created_idx",
    ).on(
      table.schoolId,
      table.actorKind,
      table.createdAt,
    ),
    check(
      "student_identity_card_events_actor_authority_check",
      sql`
        (
          ${table.actorKind} = 'SCHOOL_MEMBER'
          and ${table.actorMembershipId} is not null
        )
        or
        (
          ${table.actorKind} = 'CASA_INTERNAL'
          and ${table.actorMembershipId} is null
        )
      `,
    ),
    ],
  );
