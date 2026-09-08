import {
  randomUUID,
} from "node:crypto";
import {
  neon,
} from "@neondatabase/serverless";
import {
  sql,
} from "drizzle-orm";

import {
  getDatabaseUrl,
} from "@/config/env";
import { getDb } from "@/db";
import type {
  StudentCardRenderSnapshot,
} from "@/db/schema";
import {
  createStudentCardCredential,
} from "@/server/identity/student-card";

import {
  asArrayRow,
  createCardPublicAccessKey,
  getActiveCardTemplate,
  getStudentSnapshotSource,
} from "./production";
import {
  renderAndStoreStudentCard,
} from "./render";
import {
  assertCardStorageConfigured,
  deletePrivateCardObjectsBestEffort,
} from "./storage";

function rowsOf<T>(
  result: unknown,
): T[] {
  if (
    Array.isArray(
      result,
    )
  ) {
    return result as T[];
  }

  if (
    result &&
    typeof result ===
      "object" &&
    "rows" in result &&
    Array.isArray(
      (
        result as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      result as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

let renewalTransactionSql:
  | ReturnType<
      typeof neon
    >
  | null =
    null;

function getRenewalTransactionSql() {
  if (
    !renewalTransactionSql
  ) {
    renewalTransactionSql =
      neon(
        getDatabaseUrl(),
      );
  }

  return renewalTransactionSql;
}

export async function produceStudentCardRenewalItem(
  input: {
    renewalBatchItemId:
      string;
    origin:
      string;
  },
) {
  const db = getDb();

  const itemResult =
    await db.execute(sql`
      select
        item.id,
        item.school_id,
        item.batch_id,
        item.student_id,
        item.target_enrollment_id,
        item.branch_id,
        item.section_id,
        item.reason::text as reason,
        item.production_job_id,
        batch.target_session_id,
        batch.status::text as batch_status,
        enrollment.class_arm_id,
        enrollment.academic_session_id,
        enrollment.status::text as enrollment_status
      from student_card_renewal_batch_items item
      join student_card_renewal_batches batch
        on batch.school_id = item.school_id
       and batch.id = item.batch_id
      join student_enrollments enrollment
        on enrollment.school_id = item.school_id
       and enrollment.id = item.target_enrollment_id
       and enrollment.student_id = item.student_id
      where item.id =
        ${input.renewalBatchItemId}::uuid
      limit 1
    `);

  const renewalItem =
    asArrayRow<{
      id:
        string;
      school_id:
        string;
      batch_id:
        string;
      student_id:
        string;
      target_enrollment_id:
        string;
      branch_id:
        string;
      section_id:
        string;
      reason:
        | "CLASS_CHANGE"
        | "SESSION_CHANGE"
        | "CLASS_AND_SESSION_CHANGE";
      production_job_id:
        string | null;
      target_session_id:
        string;
      batch_status:
        string;
      class_arm_id:
        string;
      academic_session_id:
        string;
      enrollment_status:
        string;
    }>(
      itemResult,
    );

  if (!renewalItem) {
    return {
      ok: false as const,
      status: 404 as const,
      code:
        "RENEWAL_ITEM_NOT_FOUND",
    };
  }

  if (
    renewalItem
      .production_job_id
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "RENEWAL_ITEM_ALREADY_PRODUCED",
      productionJobId:
        renewalItem
          .production_job_id,
    };
  }

  if (
    ![
      "PLANNED",
      "READY",
    ].includes(
      renewalItem
        .batch_status,
    )
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "RENEWAL_BATCH_NOT_PRODUCIBLE",
    };
  }

  if (
    renewalItem
      .enrollment_status !==
      "ACTIVE" ||
    renewalItem
      .academic_session_id !==
      renewalItem
        .target_session_id
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "RENEWAL_TARGET_ENROLLMENT_NOT_AUTHORITATIVE",
    };
  }

  const branchMapResult =
    await db.execute(sql`
      select 1
      from school_branch_class_arms
      where
        school_id =
          ${renewalItem.school_id}::uuid
        and branch_id =
          ${renewalItem.branch_id}::uuid
        and class_arm_id =
          ${renewalItem.class_arm_id}::uuid
      limit 1
    `);

  if (
    !asArrayRow<{
      "?column?":
        number;
    }>(
      branchMapResult,
    )
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "RENEWAL_BRANCH_CLASS_MAPPING_MISMATCH",
    };
  }

  const [
    student,
    activeTemplate,
  ] =
    await Promise.all([
      getStudentSnapshotSource({
        schoolId:
          renewalItem
            .school_id,
        studentId:
          renewalItem
            .student_id,
      }),
      getActiveCardTemplate(
        renewalItem
          .school_id,
      ),
    ]);

  if (!student) {
    return {
      ok: false as const,
      status: 404 as const,
      code:
        "ACTIVE_STUDENT_NOT_FOUND",
    };
  }

  if (!activeTemplate) {
    return {
      ok: false as const,
      status: 503 as const,
      code:
        "ACTIVE_CARD_TEMPLATE_REQUIRED",
    };
  }

  const studentName =
    [
      student.first_name,
      student.middle_name,
      student.last_name,
    ]
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            value?.trim(),
          ),
      )
      .join(
        " ",
      )
      .trim();

  const schoolName =
    student.school_name
      ?.trim() ??
    "";

  const className =
    student.class_name
      ?.trim() ??
    "";

  const academicSession =
    student
      .academic_session_name
      ?.trim() ??
    "";

  const sexMark =
    student.sex ===
    "MALE"
      ? "M"
      : student.sex ===
          "FEMALE"
        ? "F"
        : null;

  if (
    !studentName ||
    !schoolName ||
    !className ||
    !academicSession ||
    !sexMark
  ) {
    return {
      ok: false as const,
      status: 422 as const,
      code:
        "CARD_VISIBLE_DATA_INCOMPLETE",
    };
  }

  try {
    assertCardStorageConfigured();
  } catch {
    return {
      ok: false as const,
      status: 503 as const,
      code:
        "CARD_STORAGE_NOT_CONFIGURED",
    };
  }

  const credential =
    createStudentCardCredential();

  const cardId =
    randomUUID();

  const jobId =
    randomUUID();

  const publicAccessKey =
    createCardPublicAccessKey();

  const snapshot:
    StudentCardRenderSnapshot =
      {
        schoolName,
        studentName,
        casaStudentId:
          student.casa_student_id,
        admissionNumber:
          student.admission_number,
        dateOfBirth:
          student.date_of_birth,
        sex:
          sexMark,
        className,
        academicSession,
        cardSerial:
          credential.serialNumber,
        templateVersion:
          activeTemplate
            .versionLabel,
      };

  let artifacts:
    | {
        front:
          string;
        back:
          string;
        preview:
          string;
      }
    | null =
      null;

  try {
    artifacts =
      await renderAndStoreStudentCard({
        jobId,
        qrPayload:
          credential.payload,
        template: {
          frontSourceKey:
            activeTemplate
              .frontSourceKey,
          backSourceKey:
            activeTemplate
              .backSourceKey,
          layout:
            activeTemplate.layout,
        },
        snapshot,
      });

    const now =
      new Date();

    const snapshotJson =
      JSON.stringify(
        snapshot,
      );

    const renewalReason =
      `Central renewal: ${renewalItem.reason}`;

    const transactionSql =
      getRenewalTransactionSql();

    const transactionResults =
      await transactionSql.transaction([
        transactionSql`
          select
            item.id
          from student_card_renewal_batch_items
            item
          join student_card_renewal_batches
            batch
            on batch.school_id =
               item.school_id
           and batch.id =
               item.batch_id
          join student_enrollments
            enrollment
            on enrollment.school_id =
               item.school_id
           and enrollment.id =
               item.target_enrollment_id
           and enrollment.student_id =
               item.student_id
          join school_branch_class_arms
            branch_arm
            on branch_arm.school_id =
               item.school_id
           and branch_arm.branch_id =
               item.branch_id
           and branch_arm.class_arm_id =
               enrollment.class_arm_id
          where
            item.id =
              ${renewalItem.id}::uuid
            and item.school_id =
              ${renewalItem.school_id}::uuid
            and item.student_id =
              ${renewalItem.student_id}::uuid
            and item.production_job_id
              is null
            and batch.status in (
              'PLANNED'::student_card_renewal_batch_status,
              'READY'::student_card_renewal_batch_status
            )
            and batch.target_session_id =
              ${renewalItem.target_session_id}::uuid
            and enrollment.status =
              'ACTIVE'::student_enrollment_status
            and enrollment.academic_session_id =
              batch.target_session_id
          for update of
            item,
            batch,
            enrollment,
            branch_arm
        `,

        transactionSql`
          select id
          from student_identity_cards
          where
            school_id =
              ${renewalItem.school_id}::uuid
            and student_id =
              ${renewalItem.student_id}::uuid
            and status =
              'ACTIVE'::student_identity_card_status
          for update
        `,

        transactionSql`
          update student_identity_cards
            card
          set
            status =
              'REPLACED'::student_identity_card_status,
            deactivated_at =
              ${now}::timestamptz,
            updated_at =
              ${now}::timestamptz
          where
            card.school_id =
              ${renewalItem.school_id}::uuid
            and card.student_id =
              ${renewalItem.student_id}::uuid
            and card.status =
              'ACTIVE'::student_identity_card_status
            and exists (
              select 1
              from student_card_renewal_batch_items
                item
              join student_card_renewal_batches
                batch
                on batch.school_id =
                   item.school_id
               and batch.id =
                   item.batch_id
              join student_enrollments
                enrollment
                on enrollment.school_id =
                   item.school_id
               and enrollment.id =
                   item.target_enrollment_id
               and enrollment.student_id =
                   item.student_id
              join school_branch_class_arms
                branch_arm
                on branch_arm.school_id =
                   item.school_id
               and branch_arm.branch_id =
                   item.branch_id
               and branch_arm.class_arm_id =
                   enrollment.class_arm_id
              where
                item.id =
                  ${renewalItem.id}::uuid
                and item.production_job_id
                  is null
                and batch.status in (
                  'PLANNED'::student_card_renewal_batch_status,
                  'READY'::student_card_renewal_batch_status
                )
                and batch.target_session_id =
                  ${renewalItem.target_session_id}::uuid
                and enrollment.status =
                  'ACTIVE'::student_enrollment_status
                and enrollment.academic_session_id =
                  batch.target_session_id
            )
          returning card.id
        `,

        transactionSql`
          insert into student_identity_cards (
            id,
            school_id,
            student_id,
            serial_number,
            token_hash,
            status,
            issued_at,
            deactivated_at,
            created_at,
            updated_at
          )
          select
            ${cardId}::uuid,
            item.school_id,
            item.student_id,
            ${credential.serialNumber},
            ${credential.tokenHash},
            'ACTIVE'::student_identity_card_status,
            ${now}::timestamptz,
            null,
            ${now}::timestamptz,
            ${now}::timestamptz
          from student_card_renewal_batch_items
            item
          join student_card_renewal_batches
            batch
            on batch.school_id =
               item.school_id
           and batch.id =
               item.batch_id
          join student_enrollments
            enrollment
            on enrollment.school_id =
               item.school_id
           and enrollment.id =
               item.target_enrollment_id
           and enrollment.student_id =
               item.student_id
          join school_branch_class_arms
            branch_arm
            on branch_arm.school_id =
               item.school_id
           and branch_arm.branch_id =
               item.branch_id
           and branch_arm.class_arm_id =
               enrollment.class_arm_id
          where
            item.id =
              ${renewalItem.id}::uuid
            and item.school_id =
              ${renewalItem.school_id}::uuid
            and item.student_id =
              ${renewalItem.student_id}::uuid
            and item.production_job_id
              is null
            and batch.status in (
              'PLANNED'::student_card_renewal_batch_status,
              'READY'::student_card_renewal_batch_status
            )
            and batch.target_session_id =
              ${renewalItem.target_session_id}::uuid
            and enrollment.status =
              'ACTIVE'::student_enrollment_status
            and enrollment.academic_session_id =
              batch.target_session_id
          returning id
        `,

        transactionSql`
          insert into student_identity_card_events (
            school_id,
            student_id,
            card_id,
            event_type,
            actor_kind,
            actor_membership_id,
            reason,
            created_at
          )
          select
            previous.school_id,
            previous.student_id,
            previous.id,
            'REPLACED'::student_identity_card_event_type,
            'CASA_INTERNAL',
            null,
            ${renewalReason},
            ${now}::timestamptz
          from student_identity_cards
            previous
          where
            previous.school_id =
              ${renewalItem.school_id}::uuid
            and previous.student_id =
              ${renewalItem.student_id}::uuid
            and previous.status =
              'REPLACED'::student_identity_card_status
            and previous.deactivated_at =
              ${now}::timestamptz
            and previous.updated_at =
              ${now}::timestamptz
            and exists (
              select 1
              from student_identity_cards
                current_card
              where
                current_card.id =
                  ${cardId}::uuid
                and current_card.school_id =
                  previous.school_id
                and current_card.student_id =
                  previous.student_id
                and current_card.status =
                  'ACTIVE'::student_identity_card_status
            )
          returning id
        `,

        transactionSql`
          insert into student_identity_card_events (
            school_id,
            student_id,
            card_id,
            event_type,
            actor_kind,
            actor_membership_id,
            reason,
            created_at
          )
          select
            card.school_id,
            card.student_id,
            card.id,
            'ISSUED'::student_identity_card_event_type,
            'CASA_INTERNAL',
            null,
            ${renewalReason},
            ${now}::timestamptz
          from student_identity_cards
            card
          where
            card.id =
              ${cardId}::uuid
            and card.school_id =
              ${renewalItem.school_id}::uuid
            and card.student_id =
              ${renewalItem.student_id}::uuid
            and card.status =
              'ACTIVE'::student_identity_card_status
          returning id
        `,

        transactionSql`
          insert into student_card_production_jobs (
            id,
            school_id,
            student_id,
            card_id,
            template_id,
            production_authority,
            issued_by_membership_id,
            passkey_grant_id,
            internal_authority_reference,
            public_access_key,
            public_link_revision,
            front_artifact_key,
            back_artifact_key,
            preview_artifact_key,
            render_snapshot,
            status,
            queued_at,
            created_at,
            updated_at
          )
          select
            ${jobId}::uuid,
            item.school_id,
            item.student_id,
            card.id,
            ${activeTemplate.id}::uuid,
            'CASA_INTERNAL_RENEWAL',
            null,
            null,
            item.id,
            ${publicAccessKey},
            1,
            ${artifacts.front},
            ${artifacts.back},
            ${artifacts.preview},
            ${snapshotJson}::jsonb,
            'READY'::student_card_production_status,
            ${now}::timestamptz,
            ${now}::timestamptz,
            ${now}::timestamptz
          from student_card_renewal_batch_items
            item
          join student_identity_cards
            card
            on card.school_id =
               item.school_id
           and card.student_id =
               item.student_id
           and card.id =
               ${cardId}::uuid
           and card.status =
               'ACTIVE'::student_identity_card_status
          where
            item.id =
              ${renewalItem.id}::uuid
            and item.production_job_id
              is null
            and exists (
              select 1
              from student_identity_card_events
                lifecycle
              where
                lifecycle.school_id =
                  item.school_id
                and lifecycle.student_id =
                  item.student_id
                and lifecycle.card_id =
                  card.id
                and lifecycle.event_type =
                  'ISSUED'::student_identity_card_event_type
                and lifecycle.actor_kind =
                  'CASA_INTERNAL'
                and lifecycle.actor_membership_id
                  is null
                and lifecycle.created_at =
                  ${now}::timestamptz
            )
          returning
            id,
            school_id,
            card_id,
            public_access_key,
            queued_at,
            status
        `,

        transactionSql`
          insert into student_card_production_events (
            school_id,
            job_id,
            actor_kind,
            actor_membership_id,
            event_type,
            reason,
            occurred_at,
            created_at
          )
          select
            job.school_id,
            job.id,
            'CASA_INTERNAL'::student_card_production_actor_kind,
            null,
            'CARD_PRODUCTION_READY'::student_card_production_event_type,
            ${renewalReason},
            ${now}::timestamptz,
            ${now}::timestamptz
          from student_card_production_jobs
            job
          where
            job.id =
              ${jobId}::uuid
            and job.school_id =
              ${renewalItem.school_id}::uuid
            and job.student_id =
              ${renewalItem.student_id}::uuid
            and job.production_authority =
              'CASA_INTERNAL_RENEWAL'
            and job.internal_authority_reference =
              ${renewalItem.id}::uuid
          returning id
        `,

        transactionSql`
          update student_card_renewal_batch_items
            item
          set
            production_job_id =
              ${jobId}::uuid,
            updated_at =
              ${now}::timestamptz
          where
            item.id =
              ${renewalItem.id}::uuid
            and item.production_job_id
              is null
            and exists (
              select 1
              from student_card_production_jobs
                job
              where
                job.id =
                  ${jobId}::uuid
                and job.internal_authority_reference =
                  item.id
                and job.production_authority =
                  'CASA_INTERNAL_RENEWAL'
            )
            and exists (
              select 1
              from student_card_production_events
                production_event
              where
                production_event.school_id =
                  item.school_id
                and production_event.job_id =
                  ${jobId}::uuid
                and production_event.actor_kind =
                  'CASA_INTERNAL'::student_card_production_actor_kind
                and production_event.actor_membership_id
                  is null
                and production_event.event_type =
                  'CARD_PRODUCTION_READY'::student_card_production_event_type
            )
          returning
            item.id,
            item.batch_id
        `,

        transactionSql`
          update student_card_renewal_batches
            batch
          set
            status =
              'READY'::student_card_renewal_batch_status,
            updated_at =
              ${now}::timestamptz
          where
            batch.id =
              ${renewalItem.batch_id}::uuid
            and batch.school_id =
              ${renewalItem.school_id}::uuid
            and batch.status =
              'PLANNED'::student_card_renewal_batch_status
            and exists (
              select 1
              from student_card_renewal_batch_items
                linked
              where
                linked.batch_id =
                  batch.id
                and linked.id =
                  ${renewalItem.id}::uuid
                and linked.production_job_id =
                  ${jobId}::uuid
            )
            and not exists (
              select 1
              from student_card_renewal_batch_items
                remaining
              where
                remaining.batch_id =
                  batch.id
                and remaining.production_job_id
                  is null
            )
          returning batch.id
        `,

        transactionSql`
          select
            job.id,
            job.card_id,
            job.public_access_key,
            job.queued_at,
            job.status
          from student_card_production_jobs
            job
          join student_card_renewal_batch_items
            item
            on item.school_id =
               job.school_id
           and item.id =
               job.internal_authority_reference
           and item.production_job_id =
               job.id
          where
            job.id =
              ${jobId}::uuid
            and job.school_id =
              ${renewalItem.school_id}::uuid
            and job.student_id =
              ${renewalItem.student_id}::uuid
            and job.production_authority =
              'CASA_INTERNAL_RENEWAL'
          limit 1
        `,
      ]);

    const result =
      transactionResults[
        transactionResults.length -
          1
      ] ??
      [];

    const row =
      asArrayRow<{
        id:
          string;
        card_id:
          string;
        public_access_key:
          string;
        queued_at:
          Date;
        status:
          "READY";
      }>(
        result,
      );

    if (!row) {
      await deletePrivateCardObjectsBestEffort(
        [
          artifacts.front,
          artifacts.back,
          artifacts.preview,
        ],
      );

      return {
        ok: false as const,
        status: 409 as const,
        code:
          "RENEWAL_ITEM_STATE_CHANGED",
      };
    }

    return {
      ok: true as const,
      renewalBatchItemId:
        renewalItem.id,
      renewalBatchId:
        renewalItem.batch_id,
      reason:
        renewalItem.reason,
      card: {
        id:
          row.card_id,
        serialNumber:
          credential.serialNumber,
        status:
          "ACTIVE" as const,
      },
      production: {
        id:
          row.id,
        status:
          row.status,
        authority:
          "CASA_INTERNAL_RENEWAL" as const,
        queuedAt:
          row.queued_at,
        publicUrl:
          `${input.origin.replace(/\/+$/, "")}/id-card/${row.public_access_key}`,
      },
    };
  } catch (error) {
    if (artifacts) {
      await deletePrivateCardObjectsBestEffort(
        [
          artifacts.front,
          artifacts.back,
          artifacts.preview,
        ],
      );
    }

    throw error;
  }
}

export async function produceStudentCardRenewalBatch(
  input: {
    batchId:
      string;
    origin:
      string;
    limit:
      number;
  },
) {
  const db = getDb();

  const batchResult =
    await db.execute(sql`
      select
        id,
        school_id,
        target_session_id,
        status::text as status
      from student_card_renewal_batches
      where id =
        ${input.batchId}::uuid
      limit 1
    `);

  const batch =
    asArrayRow<{
      id:
        string;
      school_id:
        string;
      target_session_id:
        string;
      status:
        string;
    }>(
      batchResult,
    );

  if (!batch) {
    return {
      ok: false as const,
      status: 404 as const,
      code:
        "RENEWAL_BATCH_NOT_FOUND",
    };
  }

  if (
    ![
      "PLANNED",
      "READY",
    ].includes(
      batch.status,
    )
  ) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "RENEWAL_BATCH_NOT_PRODUCIBLE",
    };
  }

  const itemResult =
    await db.execute(sql`
      select id
      from student_card_renewal_batch_items
      where
        school_id =
          ${batch.school_id}::uuid
        and batch_id =
          ${batch.id}::uuid
        and production_job_id
          is null
      order by id
      limit ${input.limit}
    `);

  const itemIds =
    rowsOf<{
      id:
        string;
    }>(
      itemResult,
    ).map(
      (row) =>
        row.id,
    );

  const produced = [];

  for (
    const itemId of
    itemIds
  ) {
    const result =
      await produceStudentCardRenewalItem({
        renewalBatchItemId:
          itemId,
        origin:
          input.origin,
      });

    produced.push(
      result,
    );

    if (!result.ok) {
      break;
    }
  }

  return {
    ok: true as const,
    batchId:
      batch.id,
    requested:
      itemIds.length,
    results:
      produced,
    allRequestedSucceeded:
      produced.every(
        (result) =>
          result.ok,
      ),
  };
}
