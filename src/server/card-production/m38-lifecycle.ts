import {
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  sql,
} from "drizzle-orm";

import {
  getDb,
} from "@/db";
import type {
  StudentCardRenderSnapshot,
} from "@/db/schema";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";
import {
  createStudentCardCredential,
  hashStudentCardToken,
  STUDENT_CARD_QR_PREFIX,
} from "@/server/identity/student-card";

import {
  createCardPublicAccessKey,
  getActiveCardTemplate,
  getStudentSnapshotSource,
  publicCardUrl,
} from "./production";
import {
  renderAndStoreStudentCard,
} from "./render";
import {
  assertCardStorageConfigured,
  deletePrivateCardObjectsBestEffort,
} from "./storage";

function rowsOf<T>(
  value: unknown,
): T[] {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value as T[];
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "rows" in
      value &&
    Array.isArray(
      (
        value as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      value as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

type StudentSource =
  NonNullable<
    Awaited<
      ReturnType<
        typeof getStudentSnapshotSource
      >
    >
  >;

function buildSnapshot(
  input: {
    student:
      StudentSource;
    templateVersion:
      string;
    cardSerial:
      string;
  },
):
  StudentCardRenderSnapshot |
  null {
  const studentName =
    [
      input.student
        .first_name,
      input.student
        .middle_name,
      input.student
        .last_name,
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

  if (
    !studentName ||
    !input.student
      .school_name
      ?.trim() ||
    !input.student
      .class_name
      ?.trim() ||
    ![
      "MALE",
      "FEMALE",
    ].includes(
      input.student.sex,
    )
  ) {
    return null;
  }

  return {
    schoolName:
      input.student
        .school_name,
    studentName,
    casaStudentId:
      input.student
        .casa_student_id,
    admissionNumber:
      input.student
        .admission_number,
    dateOfBirth:
      input.student
        .date_of_birth,
    sex:
      input.student.sex ===
        "MALE"
        ? "M"
        : input.student.sex ===
            "FEMALE"
          ? "F"
          : "",
    className:
      input.student
        .class_name,
    branchId:
      input.student
        .branch_id,
    branchName:
      input.student
        .branch_name,
    academicSession:
      null,
    cardSerial:
      input.cardSerial,
    templateVersion:
      input.templateVersion,
  };
}

export type FirstCardProvisioningResult =
  | {
      status:
        "CREATED";
      cardId:
        string;
      jobId:
        string;
      publicUrl:
        string;
    }
  | {
      status:
        "ALREADY_PRESENT";
      cardId:
        string;
    }
  | {
      status:
        "DEFERRED_NO_TEMPLATE";
    }
  | {
      status:
        "DEFERRED_INCOMPLETE_CARD_DATA";
    }
  | {
      status:
        "NO_ACTIVE_ENROLLMENT";
    }
  | {
      status:
        "STATE_CHANGED";
    };

export async function ensureFirstStudentCardForEnrollment(
  input: {
    access:
      SchoolAccess;
    studentId:
      string;
    enrollmentId:
      string;
    origin:
      string;
  },
): Promise<FirstCardProvisioningResult> {
  const db =
    getDb();

  const enrollment =
    rowsOf<{
      id: string;
    }>(
      await db.execute(sql`
        select
          enrollment.id
        from student_enrollments enrollment
        join students student
          on student.school_id =
             enrollment.school_id
         and student.id =
             enrollment.student_id
         and student.status =
             'ACTIVE'::student_status
        where
          enrollment.school_id =
            ${input.access.school.id}::uuid
          and enrollment.student_id =
            ${input.studentId}::uuid
          and enrollment.id =
            ${input.enrollmentId}::uuid
          and enrollment.status =
            'ACTIVE'::student_enrollment_status
        limit 1
      `),
    )[0];

  if (!enrollment) {
    return {
      status:
        "NO_ACTIVE_ENROLLMENT",
    };
  }

  const existing =
    rowsOf<{
      id: string;
    }>(
      await db.execute(sql`
        select id
        from student_identity_cards
        where
          school_id =
            ${input.access.school.id}::uuid
          and student_id =
            ${input.studentId}::uuid
        order by issued_at desc
        limit 1
      `),
    )[0];

  if (existing) {
    return {
      status:
        "ALREADY_PRESENT",
      cardId:
        existing.id,
    };
  }

  const template =
    await getActiveCardTemplate(
      input.access.school.id,
    );

  if (!template) {
    return {
      status:
        "DEFERRED_NO_TEMPLATE",
    };
  }

  const student =
    await getStudentSnapshotSource({
      schoolId:
        input.access.school.id,
      studentId:
        input.studentId,
    });

  if (!student) {
    return {
      status:
        "DEFERRED_INCOMPLETE_CARD_DATA",
    };
  }

  const credential =
    createStudentCardCredential();
  const snapshot =
    buildSnapshot({
      student,
      templateVersion:
        template.versionLabel,
      cardSerial:
        credential.serialNumber,
    });

  if (!snapshot) {
    return {
      status:
        "DEFERRED_INCOMPLETE_CARD_DATA",
    };
  }

  try {
    assertCardStorageConfigured();
  } catch {
    return {
      status:
        "DEFERRED_NO_TEMPLATE",
    };
  }

  const cardId =
    randomUUID();
  const jobId =
    randomUUID();
  const publicAccessKey =
    createCardPublicAccessKey();

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
            template.frontSourceKey,
          backSourceKey:
            template.backSourceKey,
          layout:
            template.layout,
        },
        snapshot,
      });

    const snapshotJson =
      JSON.stringify(
        snapshot,
      );
    const now =
      new Date()
        .toISOString();

    const result =
      rowsOf<{
        id: string;
        card_id:
          string;
      }>(
        await db.execute(sql`
          with valid_enrollment as (
            select id
            from student_enrollments
            where
              school_id =
                ${input.access.school.id}::uuid
              and student_id =
                ${input.studentId}::uuid
              and id =
                ${input.enrollmentId}::uuid
              and status =
                'ACTIVE'::student_enrollment_status
          ),
          state_guard as (
            select 1
            where
              exists (
                select 1
                from valid_enrollment
              )
              and not exists (
                select 1
                from student_identity_cards existing
                where
                  existing.school_id =
                    ${input.access.school.id}::uuid
                  and existing.student_id =
                    ${input.studentId}::uuid
              )
          ),
          inserted_card as (
            insert into student_identity_cards (
              id,
              school_id,
              student_id,
              serial_number,
              token_hash,
              status,
              issued_at,
              created_at,
              updated_at
            )
            select
              ${cardId}::uuid,
              ${input.access.school.id}::uuid,
              ${input.studentId}::uuid,
              ${credential.serialNumber},
              ${credential.tokenHash},
              'READY_FOR_ACTIVATION'::student_identity_card_status,
              ${now}::timestamptz,
              ${now}::timestamptz,
              ${now}::timestamptz
            from state_guard
            returning id
          ),
          lifecycle_event as (
            insert into student_identity_card_events (
              school_id,
              student_id,
              card_id,
              actor_kind,
              actor_membership_id,
              event_type,
              reason,
              created_at
            )
            select
              ${input.access.school.id}::uuid,
              ${input.studentId}::uuid,
              inserted_card.id,
              'SCHOOL_MEMBER',
              ${input.access.membership.id}::uuid,
              'ISSUED'::student_identity_card_event_type,
              'Automatic first card created from active enrollment',
              ${now}::timestamptz
            from inserted_card
            returning id
          ),
          inserted_job as (
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
              ${input.access.school.id}::uuid,
              ${input.studentId}::uuid,
              inserted_card.id,
              ${template.id}::uuid,
              'SCHOOL_ENROLLMENT_AUTO_ISSUE',
              ${input.access.membership.id}::uuid,
              null,
              ${input.enrollmentId}::uuid,
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
            from inserted_card
            where exists (
              select 1
              from lifecycle_event
            )
            returning
              id,
              card_id
          ),
          production_event as (
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
              ${input.access.school.id}::uuid,
              inserted_job.id,
              'SCHOOL_MEMBER'::student_card_production_actor_kind,
              ${input.access.membership.id}::uuid,
              'CARD_PRODUCTION_READY'::student_card_production_event_type,
              'Automatic first card created from active enrollment',
              ${now}::timestamptz,
              ${now}::timestamptz
            from inserted_job
            returning id
          )
          select
            inserted_job.id,
            inserted_job.card_id
          from inserted_job
          where exists (
            select 1
            from production_event
          )
        `),
      )[0] ??
      null;

    if (!result) {
      await deletePrivateCardObjectsBestEffort(
        [
          artifacts.front,
          artifacts.back,
          artifacts.preview,
        ],
      );

      const concurrent =
        rowsOf<{
          id: string;
        }>(
          await db.execute(sql`
            select id
            from student_identity_cards
            where
              school_id =
                ${input.access.school.id}::uuid
              and student_id =
                ${input.studentId}::uuid
            order by issued_at desc
            limit 1
          `),
        )[0];

      return concurrent
        ? {
            status:
              "ALREADY_PRESENT",
            cardId:
              concurrent.id,
          }
        : {
            status:
              "STATE_CHANGED",
          };
    }

    return {
      status:
        "CREATED",
      cardId:
        result.card_id,
      jobId:
        result.id,
      publicUrl:
        publicCardUrl(
          input.origin,
          publicAccessKey,
        ),
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

export async function ensureFirstStudentCardForActiveEnrollment(
  input: {
    access:
      SchoolAccess;
    studentId:
      string;
    origin:
      string;
  },
): Promise<FirstCardProvisioningResult> {
  const enrollment =
    rowsOf<{
      id: string;
    }>(
      await getDb()
        .execute(sql`
          select id
          from student_enrollments
          where
            school_id =
              ${input.access.school.id}::uuid
            and student_id =
              ${input.studentId}::uuid
            and status =
              'ACTIVE'::student_enrollment_status
          order by
            starts_on desc,
            created_at desc
          limit 1
        `),
    )[0];

  if (!enrollment) {
    return {
      status:
        "NO_ACTIVE_ENROLLMENT",
    };
  }

  return ensureFirstStudentCardForEnrollment({
    access:
      input.access,
    studentId:
      input.studentId,
    enrollmentId:
      enrollment.id,
    origin:
      input.origin,
  });
}

export interface TemplatePropagationResult {
  total:
    number;
  refreshed:
    number;
  requeuedFromExported:
    number;
  skipped:
    number;
  failed:
    number;
}

export async function refreshUnprintedCardsForTemplate(
  input: {
    schoolId:
      string;
    templateId:
      string;
  },
): Promise<TemplatePropagationResult> {
  const db =
    getDb();

  const template =
    rowsOf<{
      id: string;
      version_label:
        string;
      front_source_key:
        string;
      back_source_key:
        string;
      layout: unknown;
    }>(
      await db.execute(sql`
        select
          id,
          version_label,
          front_source_key,
          back_source_key,
          layout
        from student_card_templates
        where
          school_id =
            ${input.schoolId}::uuid
          and id =
            ${input.templateId}::uuid
          and status =
            'ACTIVE'::student_card_template_status
        limit 1
      `),
    )[0];

  if (!template) {
    return {
      total: 0,
      refreshed: 0,
      requeuedFromExported: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const jobs =
    rowsOf<{
      id: string;
      student_id:
        string;
      card_id:
        string;
      status:
        "READY" |
        "EXPORTED";
      front_artifact_key:
        string;
      back_artifact_key:
        string;
      preview_artifact_key:
        string;
      serial_number:
        string;
    }>(
      await db.execute(sql`
        select
          job.id,
          job.student_id,
          job.card_id,
          job.status::text as status,
          job.front_artifact_key,
          job.back_artifact_key,
          job.preview_artifact_key,
          card.serial_number
        from student_card_production_jobs job
        join student_identity_cards card
          on card.school_id =
             job.school_id
         and card.id =
             job.card_id
        where
          job.school_id =
            ${input.schoolId}::uuid
          and job.status in (
            'READY'::student_card_production_status,
            'EXPORTED'::student_card_production_status
          )
          and card.status =
            'READY_FOR_ACTIVATION'::student_identity_card_status
        order by
          job.queued_at asc
      `),
    );

  let refreshed =
    0;
  let requeuedFromExported =
    0;
  let skipped =
    0;
  let failed =
    0;

  for (
    const job of
    jobs
  ) {
    let newArtifacts:
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
      const student =
        await getStudentSnapshotSource({
          schoolId:
            input.schoolId,
          studentId:
            job.student_id,
        });

      if (!student) {
        skipped +=
          1;
        continue;
      }

      const snapshot =
        buildSnapshot({
          student,
          templateVersion:
            template.version_label,
          cardSerial:
            job.serial_number,
        });

      if (!snapshot) {
        skipped +=
          1;
        continue;
      }

      const token =
        randomBytes(
          32,
        ).toString(
          "base64url",
        );
      const tokenHash =
        hashStudentCardToken(
          token,
        );
      const qrPayload =
        `${STUDENT_CARD_QR_PREFIX}${token}`;
      const artifactRevision =
        `m38-${template.id.slice(
          0,
          8,
        )}-${randomUUID()
          .replaceAll(
            "-",
            "",
          )
          .slice(
            0,
            16,
          )}`;

      newArtifacts =
        await renderAndStoreStudentCard({
          jobId:
            job.id,
          qrPayload,
          artifactRevision,
          template: {
            frontSourceKey:
              template.front_source_key,
            backSourceKey:
              template.back_source_key,
            layout:
              template.layout,
          },
          snapshot,
        });

      const snapshotJson =
        JSON.stringify(
          snapshot,
        );

      const changed =
        rowsOf<{
          id: string;
        }>(
          await db.execute(sql`
            with target_job as materialized (
              select
                current_job.id,
                current_job.card_id
              from student_card_production_jobs current_job
              where
                current_job.school_id =
                  ${input.schoolId}::uuid
                and current_job.id =
                  ${job.id}::uuid
                and current_job.card_id =
                  ${job.card_id}::uuid
                and current_job.status in (
                  'READY'::student_card_production_status,
                  'EXPORTED'::student_card_production_status
                )
              for update
            ),
            target_card as materialized (
              select current_card.id
              from student_identity_cards current_card
              where
                current_card.school_id =
                  ${input.schoolId}::uuid
                and current_card.id =
                  ${job.card_id}::uuid
                and current_card.status =
                  'READY_FOR_ACTIVATION'::student_identity_card_status
                and exists (
                  select 1
                  from target_job
                )
              for update
            ),
            card_changed as (
              update student_identity_cards card
              set
                token_hash =
                  ${tokenHash},
                updated_at =
                  now()
              from target_card
              where
                card.school_id =
                  ${input.schoolId}::uuid
                and card.id =
                  target_card.id
              returning card.id
            ),
            job_changed as (
              update student_card_production_jobs current_job
              set
                template_id =
                  ${template.id}::uuid,
                front_artifact_key =
                  ${newArtifacts.front},
                back_artifact_key =
                  ${newArtifacts.back},
                preview_artifact_key =
                  ${newArtifacts.preview},
                render_snapshot =
                  ${snapshotJson}::jsonb,
                status =
                  'READY'::student_card_production_status,
                exported_at =
                  null,
                printed_at =
                  null,
                updated_at =
                  now()
              from target_job
              where
                current_job.school_id =
                  ${input.schoolId}::uuid
                and current_job.id =
                  target_job.id
                and exists (
                  select 1
                  from card_changed
                )
              returning current_job.id
            )
            select id
            from job_changed
          `),
        )[0];

      if (!changed) {
        await deletePrivateCardObjectsBestEffort(
          [
            newArtifacts.front,
            newArtifacts.back,
            newArtifacts.preview,
          ],
        );
        newArtifacts =
          null;
        skipped +=
          1;
        continue;
      }

      await deletePrivateCardObjectsBestEffort(
        [
          job.front_artifact_key,
          job.back_artifact_key,
          job.preview_artifact_key,
        ],
      );

      refreshed +=
        1;

      if (
        job.status ===
        "EXPORTED"
      ) {
        requeuedFromExported +=
          1;
      }
    } catch (error) {
      failed +=
        1;

      if (newArtifacts) {
        await deletePrivateCardObjectsBestEffort(
          [
            newArtifacts.front,
            newArtifacts.back,
            newArtifacts.preview,
          ],
        );
      }

      console.error(
        "M38 unprinted card template refresh failed",
        {
          schoolId:
            input.schoolId,
          templateId:
            input.templateId,
          jobId:
            job.id,
          error,
        },
      );
    }
  }

  return {
    total:
      jobs.length,
    refreshed,
    requeuedFromExported,
    skipped,
    failed,
  };
}
