import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  studentCardProductionActorKindEnum,
  studentCardProductionEventTypeEnum,
  studentCardProductionStatusEnum,
  studentCardTemplateStatusEnum,
} from "./card-production-enums";
import {
  authPasskeyStepUpGrants,
} from "./passkeys";
import { schools } from "./schools";
import {
  studentIdentityCards,
} from "./student-identity";
import { students } from "./students";
import {
  schoolMemberships,
} from "./users";

export interface StudentCardRenderSnapshot {
  schoolName: string;
  studentName: string;

  // Internal production/audit metadata. These values are not
  // available to the card-template renderer unless explicitly
  // included in CardTextSource.
  casaStudentId: string;
  admissionNumber:
    string | null;
  dateOfBirth: string;

  // Visible-card normalized values.
  sex: "M" | "F" | "";
  className:
    string | null;
  // Branch is production/audit metadata captured at issuance.
  // It is intentionally not a printable dynamic card field.
  branchId?: string | null;
  branchName?: string | null;
  /** @deprecated Pass A: never rendered on physical cards. */
  academicSession:
    string | null;

  // Internal production/audit metadata.
  cardSerial: string;
  templateVersion: string;
}

export const studentCardTemplates =
  pgTable(
    "student_card_templates",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid(
        "school_id",
      )
        .notNull()
        .references(
          () => schools.id,
        ),
      versionLabel: varchar(
        "version_label",
        {
          length: 80,
        },
      ).notNull(),
      status:
        studentCardTemplateStatusEnum(
          "status",
        )
          .default("DRAFT")
          .notNull(),
      frontSourceKey: text(
        "front_source_key",
      ).notNull(),
      backSourceKey: text(
        "back_source_key",
      ).notNull(),
      layout: jsonb(
        "layout",
      )
        .$type<
          Record<
            string,
            unknown
          >
        >()
        .notNull(),
      notes: varchar(
        "notes",
        {
          length: 240,
        },
      ),
      activatedAt: timestamp(
        "activated_at",
        {
          withTimezone: true,
        },
      ),
      retiredAt: timestamp(
        "retired_at",
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
        "student_card_templates_school_version_unique",
      ).on(
        table.schoolId,
        table.versionLabel,
      ),
      uniqueIndex(
        "student_card_templates_one_active_per_school_idx",
      )
        .on(
          table.schoolId,
        )
        .where(
          sql`${table.status} = 'ACTIVE'`,
        ),
      check(
        "student_card_templates_version_not_blank_check",
        sql`length(trim(${table.versionLabel})) > 0`,
      ),
      check(
        "student_card_templates_sources_not_blank_check",
        sql`length(trim(${table.frontSourceKey})) > 0 and length(trim(${table.backSourceKey})) > 0`,
      ),
      check(
        "student_card_templates_status_dates_check",
        sql`(
          (${table.status} = 'DRAFT' and ${table.activatedAt} is null and ${table.retiredAt} is null)
          or
          (${table.status} = 'ACTIVE' and ${table.activatedAt} is not null and ${table.retiredAt} is null)
          or
          (${table.status} = 'RETIRED' and ${table.activatedAt} is not null and ${table.retiredAt} is not null)
        )`,
      ),
    ],
  );

export const studentCardProductionJobs =
  pgTable(
    "student_card_production_jobs",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid(
        "school_id",
      )
        .notNull()
        .references(
          () => schools.id,
        ),
      studentId: uuid(
        "student_id",
      ).notNull(),
      cardId: uuid(
        "card_id",
      ).notNull(),
      templateId: uuid(
        "template_id",
      )
        .notNull()
        .references(
          () =>
            studentCardTemplates.id,
        ),
      productionAuthority: varchar(
        "production_authority",
        {
          length: 32,
        },
      )
        .$type<
          | "SCHOOL_MEMBERSHIP"
          | "CASA_INTERNAL_RENEWAL"
        >()
        .default(
          "SCHOOL_MEMBERSHIP",
        )
        .notNull(),
      issuedByMembershipId:
        uuid(
          "issued_by_membership_id",
        ),
      passkeyGrantId: uuid(
        "passkey_grant_id",
      )
        .references(
          () =>
            authPasskeyStepUpGrants.id,
        ),      internalAuthorityReference: uuid(
        "internal_authority_reference",
      ),

      publicAccessKey:
        varchar(
          "public_access_key",
          {
            length: 43,
          },
        ).notNull(),
      publicLinkRevision:
        integer(
          "public_link_revision",
        )
          .default(1)
          .notNull(),
      frontArtifactKey: text(
        "front_artifact_key",
      ).notNull(),
      backArtifactKey: text(
        "back_artifact_key",
      ).notNull(),
      previewArtifactKey:
        text(
          "preview_artifact_key",
        ).notNull(),
      renderSnapshot: jsonb(
        "render_snapshot",
      )
        .$type<StudentCardRenderSnapshot>()
        .notNull(),
      status:
        studentCardProductionStatusEnum(
          "status",
        )
          .default("READY")
          .notNull(),
      queuedAt: timestamp(
        "queued_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
      exportedAt: timestamp(
        "exported_at",
        {
          withTimezone: true,
        },
      ),
      printedAt: timestamp(
        "printed_at",
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
        "student_card_production_jobs_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      unique(
        "student_card_production_jobs_school_card_unique",
      ).on(
        table.schoolId,
        table.cardId,
      ),
      unique(
        "student_card_production_jobs_public_access_key_unique",
      ).on(
        table.publicAccessKey,
      ),
      index(
        "student_card_production_jobs_school_status_queued_idx",
      ).on(
        table.schoolId,
        table.status,
        table.queuedAt,
      ),
      index(
        "student_card_production_jobs_status_queued_idx",
      ).on(
        table.status,
        table.queuedAt,
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
        name: "student_card_production_jobs_school_student_fk",
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
        name: "student_card_production_jobs_school_card_fk",
      }),
      foreignKey({
        columns: [
          table.schoolId,
          table.issuedByMembershipId,
        ],
        foreignColumns: [
          schoolMemberships.schoolId,
          schoolMemberships.id,
        ],
        name: "student_card_production_jobs_school_issuer_fk",
      }),
      check(
        "student_card_production_jobs_public_key_format_check",
        sql`${table.publicAccessKey} ~ '^[A-Za-z0-9_-]{43}$'`,
      ),
      check(
        "student_card_production_jobs_public_revision_check",
        sql`${table.publicLinkRevision} >= 1`,
      ),
      check(
        "student_card_production_jobs_artifacts_not_blank_check",
        sql`length(trim(${table.frontArtifactKey})) > 0 and length(trim(${table.backArtifactKey})) > 0 and length(trim(${table.previewArtifactKey})) > 0`,
      ),
      check(
        "student_card_production_jobs_status_dates_check",
        sql`(
          (${table.status} = 'READY' and ${table.exportedAt} is null and ${table.printedAt} is null)
          or
          (${table.status} = 'EXPORTED' and ${table.exportedAt} is not null and ${table.printedAt} is null)
          or
          (${table.status} = 'PRINTED' and ${table.exportedAt} is not null and ${table.printedAt} is not null)
        )`,
      ),
    uniqueIndex(
      "student_card_production_jobs_internal_authority_reference_unique",
    )
      .on(
        table.internalAuthorityReference,
      )
      .where(
        sql`undefined is not null`,
      ),
    index(
      "student_card_production_jobs_authority_status_idx",
    ).on(
      table.productionAuthority,
      table.status,
    ),
    check(
      "student_card_production_jobs_authority_check",
      sql`
        (
          undefined = 'SCHOOL_MEMBERSHIP'
          and undefined is not null
          and undefined is not null
          and undefined is null
        )
        or
        (
          undefined = 'CASA_INTERNAL_RENEWAL'
          and undefined is null
          and undefined is null
          and undefined is not null
        )
      `,
    ),
    ],
  );

export const studentCardProductionEvents =
  pgTable(
    "student_card_production_events",
    {
      id: uuid("id")
        .defaultRandom()
        .primaryKey(),
      schoolId: uuid(
        "school_id",
      )
        .notNull()
        .references(
          () => schools.id,
        ),
      jobId: uuid(
        "job_id",
      ).notNull(),
      actorKind:
        studentCardProductionActorKindEnum(
          "actor_kind",
        ).notNull(),
      actorMembershipId: uuid(
        "actor_membership_id",
      ),
      eventType:
        studentCardProductionEventTypeEnum(
          "event_type",
        ).notNull(),
      reason: varchar(
        "reason",
        {
          length: 240,
        },
      ),
      occurredAt: timestamp(
        "occurred_at",
        {
          withTimezone: true,
        },
      )
        .defaultNow()
        .notNull(),
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
        "student_card_production_events_school_id_id_unique",
      ).on(
        table.schoolId,
        table.id,
      ),
      uniqueIndex(
        "student_card_production_events_ready_once_idx",
      )
        .on(
          table.jobId,
          table.eventType,
        )
        .where(
          sql`${table.eventType} = 'CARD_PRODUCTION_READY'`,
        ),
      index(
        "student_card_production_events_job_occurred_idx",
      ).on(
        table.schoolId,
        table.jobId,
        table.occurredAt,
      ),
      foreignKey({
        columns: [
          table.schoolId,
          table.jobId,
        ],
        foreignColumns: [
          studentCardProductionJobs.schoolId,
          studentCardProductionJobs.id,
        ],
        name: "student_card_production_events_school_job_fk",
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
        name: "student_card_production_events_school_actor_fk",
      }),
      check(
        "student_card_production_events_actor_check",
        sql`(
          (${table.actorKind} = 'SCHOOL_MEMBER' and ${table.actorMembershipId} is not null)
          or
          (${table.actorKind} = 'CASA_INTERNAL' and ${table.actorMembershipId} is null)
        )`,
      ),
      check(
        "student_card_production_events_reason_check",
        sql`${table.reason} is null or length(trim(${table.reason})) > 0`,
      ),
    ],
  );
