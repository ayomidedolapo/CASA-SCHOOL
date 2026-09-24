import {
  randomUUID,
} from "node:crypto";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  StudentCardRenderSnapshot,
} from "@/db/schema";
import {
  createStudentCardCredential,
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
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
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
      .join(" ")
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

export async function listReplacementBatchGroups(
  input: {
    schoolId:
      string | null;
    branchId:
      string | null;
  },
) {
  return rowsOf<{
    school_id:
      string;
    school_name:
      string;
    batch_eligible_on:
      string;
    student_count:
      number;
    due:
      boolean;
    students:
      Array<{
        case_id: string;
        student_id:
          string;
        student_name:
          string;
        casa_student_id:
          string;
        branch_id:
          string | null;
        branch_name:
          string | null;
        class_name:
          string | null;
        replacement_reason:
          "LOST" |
          "DAMAGED";
      }>;
  }>(
    await getDb()
      .execute(sql`
        select
          replacement.school_id::text
            as school_id,
          school.name
            as school_name,
          replacement.batch_eligible_on::text
            as batch_eligible_on,
          count(*)::int
            as student_count,
          bool_and(
            replacement.batch_eligible_on <=
              (
                now() at time zone
                  school.timezone
              )::date
          ) as due,
          jsonb_agg(
            jsonb_build_object(
              'case_id',
                replacement.id::text,
              'student_id',
                student.id::text,
              'student_name',
                concat_ws(
                  ' ',
                  student.first_name,
                  nullif(
                    student.middle_name,
                    ''
                  ),
                  student.last_name
                ),
              'casa_student_id',
                student.casa_student_id,
              'branch_id',
                current_class.branch_id,
              'branch_name',
                current_class.branch_name,
              'class_name',
                current_class.class_name,
              'replacement_reason',
                replacement.replacement_reason::text
            )
            order by
              student.last_name,
              student.first_name,
              student.casa_student_id
          ) as students
        from student_card_replacement_cases
          replacement
        join schools
          school
          on school.id =
             replacement.school_id
        join students
          student
          on student.school_id =
             replacement.school_id
         and student.id =
             replacement.student_id
        left join lateral (
          select
            branch.id::text
              as branch_id,
            branch.name
              as branch_name,
            concat_ws(
              ' ',
              level.name,
              arm.name
            ) as class_name
          from student_enrollments
            enrollment
          join class_arms arm
            on arm.school_id =
               enrollment.school_id
           and arm.id =
               enrollment.class_arm_id
          join class_levels level
            on level.school_id =
               arm.school_id
           and level.id =
               arm.class_level_id
          left join school_branch_class_arms
            branch_arm
            on branch_arm.school_id =
               enrollment.school_id
           and branch_arm.class_arm_id =
               enrollment.class_arm_id
          left join school_branches
            branch
            on branch.school_id =
               enrollment.school_id
           and branch.id =
               branch_arm.branch_id
          where
            enrollment.school_id =
              replacement.school_id
            and enrollment.student_id =
              replacement.student_id
            and enrollment.status =
              'ACTIVE'::student_enrollment_status
          order by
            enrollment.starts_on desc,
            enrollment.created_at desc
          limit 1
        ) current_class
          on true
        where
          replacement.status =
            'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
          and replacement.payment_status =
            'PAID'::student_card_replacement_payment_status
          and replacement.batch_eligible_on
            is not null
          and replacement.replacement_card_id
            is null
          and (
            ${input.schoolId}::uuid
              is null
            or replacement.school_id =
               ${input.schoolId}::uuid
          )
          and (
            ${input.branchId}::text
              is null
            or current_class.branch_id =
               ${input.branchId}
          )
        group by
          replacement.school_id,
          school.name,
          replacement.batch_eligible_on
        order by
          replacement.batch_eligible_on asc,
          school.name asc
        limit 1000
      `),
  );
}

async function produceReplacementCase(
  input: {
    caseId: string;
    origin: string;
  },
) {
  const db =
    getDb();

  const replacement =
    rowsOf<{
      id: string;
      school_id: string;
      student_id: string;
      replacement_reason:
        "LOST" | "DAMAGED";
      batch_eligible_on:
        string;
    }>(
      await db.execute(sql`
        select
          replacement.id,
          replacement.school_id,
          replacement.student_id,
          replacement.replacement_reason::text
            as replacement_reason,
          replacement.batch_eligible_on::text
            as batch_eligible_on
        from student_card_replacement_cases
          replacement
        join schools
          school
          on school.id =
             replacement.school_id
        where
          replacement.id =
            ${input.caseId}::uuid
          and replacement.status =
            'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
          and replacement.payment_status =
            'PAID'::student_card_replacement_payment_status
          and replacement.batch_eligible_on
            is not null
          and replacement.batch_eligible_on <=
            (
              now() at time zone
                school.timezone
            )::date
          and replacement.replacement_card_id
            is null
          and not exists (
            select 1
            from student_identity_cards
              current_card
            where
              current_card.school_id =
                replacement.school_id
              and current_card.student_id =
                replacement.student_id
              and current_card.status in (
                'ACTIVE'::student_identity_card_status,
                'READY_FOR_ACTIVATION'::student_identity_card_status
              )
          )
        limit 1
      `),
    )[0];

  if (!replacement) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "REPLACEMENT_CASE_NOT_DUE_OR_STATE_CHANGED",
      caseId:
        input.caseId,
    };
  }

  const [
    template,
    student,
  ] =
    await Promise.all([
      getActiveCardTemplate(
        replacement.school_id,
      ),
      getStudentSnapshotSource({
        schoolId:
          replacement.school_id,
        studentId:
          replacement.student_id,
      }),
    ]);

  if (!template) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "ACTIVE_CARD_TEMPLATE_REQUIRED",
      caseId:
        replacement.id,
    };
  }

  if (!student) {
    return {
      ok: false as const,
      status: 422 as const,
      code:
        "CARD_VISIBLE_DATA_INCOMPLETE",
      caseId:
        replacement.id,
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
      ok: false as const,
      status: 422 as const,
      code:
        "CARD_VISIBLE_DATA_INCOMPLETE",
      caseId:
        replacement.id,
    };
  }

  assertCardStorageConfigured();

  const cardId =
    randomUUID();
  const jobId =
    randomUUID();
  const publicAccessKey =
    createCardPublicAccessKey();

  let artifacts:
    | {
        front: string;
        back: string;
        preview: string;
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

    const now =
      new Date()
        .toISOString();
    const snapshotJson =
      JSON.stringify(
        snapshot,
      );
    const eventReason =
      `Scheduled CASA ${replacement.replacement_reason.toLowerCase()} replacement batch`;

    const row =
      rowsOf<{
        job_id:
          string;
        card_id:
          string;
        status:
          "READY";
        public_access_key:
          string;
        queued_at:
          Date | string;
      }>(
        await db.execute(sql`
          with locked_case as materialized (
            select
              replacement.id,
              replacement.school_id,
              replacement.student_id,
              replacement.replacement_reason
            from student_card_replacement_cases
              replacement
            join schools
              school
              on school.id =
                 replacement.school_id
            where
              replacement.id =
                ${replacement.id}::uuid
              and replacement.status =
                'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
              and replacement.payment_status =
                'PAID'::student_card_replacement_payment_status
              and replacement.batch_eligible_on <=
                (
                  now() at time zone
                    school.timezone
                )::date
              and replacement.replacement_card_id
                is null
              and not exists (
                select 1
                from student_identity_cards
                  existing
                where
                  existing.school_id =
                    replacement.school_id
                  and existing.student_id =
                    replacement.student_id
                  and existing.status in (
                    'ACTIVE'::student_identity_card_status,
                    'READY_FOR_ACTIVATION'::student_identity_card_status
                  )
              )
            for update
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
              locked.school_id,
              locked.student_id,
              ${credential.serialNumber},
              ${credential.tokenHash},
              'READY_FOR_ACTIVATION'::student_identity_card_status,
              ${now}::timestamptz,
              ${now}::timestamptz,
              ${now}::timestamptz
            from locked_case
              locked
            returning
              id,
              school_id,
              student_id
          ),
          updated_case as (
            update student_card_replacement_cases
              replacement_case
            set
              replacement_card_id =
                card.id,
              updated_at =
                ${now}::timestamptz
            from inserted_card
              card,
              locked_case
                locked
            where
              replacement_case.id =
                locked.id
              and replacement_case.school_id =
                card.school_id
              and replacement_case.student_id =
                card.student_id
              and replacement_case.replacement_card_id
                is null
            returning
              replacement_case.id,
              replacement_case.school_id,
              replacement_case.student_id,
              replacement_case.replacement_reason
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
              updated.school_id,
              updated.student_id,
              card.id,
              'CASA_INTERNAL',
              null,
              'ISSUED'::student_identity_card_event_type,
              ${eventReason},
              ${now}::timestamptz
            from updated_case
              updated
            join inserted_card
              card
              on card.school_id =
                 updated.school_id
             and card.student_id =
                 updated.student_id
            returning
              id
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
              updated.school_id,
              updated.student_id,
              card.id,
              ${template.id}::uuid,
              'CASA_INTERNAL_REPLACEMENT',
              null,
              null,
              updated.id,
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
            from updated_case
              updated
            join inserted_card
              card
              on card.school_id =
                 updated.school_id
             and card.student_id =
                 updated.student_id
            where exists (
              select 1
              from lifecycle_event
            )
            returning
              id,
              school_id,
              card_id,
              status,
              public_access_key,
              queued_at
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
              job.school_id,
              job.id,
              'CASA_INTERNAL'::student_card_production_actor_kind,
              null,
              'CARD_PRODUCTION_READY'::student_card_production_event_type,
              ${eventReason},
              ${now}::timestamptz,
              ${now}::timestamptz
            from inserted_job
              job
            returning
              id
          )
          select
            job.id
              as job_id,
            job.card_id,
            job.status::text
              as status,
            job.public_access_key,
            job.queued_at
          from inserted_job
            job
          where exists (
            select 1
            from production_event
          )
        `),
      )[0];

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
          "REPLACEMENT_CASE_STATE_CHANGED",
        caseId:
          replacement.id,
      };
    }

    return {
      ok: true as const,
      caseId:
        replacement.id,
      replacementReason:
        replacement.replacement_reason,
      card: {
        id:
          row.card_id,
        serialNumber:
          credential.serialNumber,
        status:
          "READY_FOR_ACTIVATION" as const,
      },
      production: {
        id:
          row.job_id,
        status:
          row.status,
        authority:
          "CASA_INTERNAL_REPLACEMENT" as const,
        queuedAt:
          row.queued_at,
        publicUrl:
          publicCardUrl(
            input.origin,
            row.public_access_key,
          ),
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

export async function releaseDueReplacementBatch(
  input: {
    schoolId: string;
    batchEligibleOn: string;
    branchId:
      string | null;
    origin: string;
    limit: number;
  },
) {
  const caseIds =
    rowsOf<{
      id: string;
    }>(
      await getDb()
        .execute(sql`
          select
            replacement.id
          from student_card_replacement_cases
            replacement
          join schools
            school
            on school.id =
               replacement.school_id
          where
            replacement.school_id =
              ${input.schoolId}::uuid
            and replacement.status =
              'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
            and replacement.payment_status =
              'PAID'::student_card_replacement_payment_status
            and replacement.batch_eligible_on =
              ${input.batchEligibleOn}::date
            and replacement.batch_eligible_on <=
              (
                now() at time zone
                  school.timezone
              )::date
            and replacement.replacement_card_id
              is null
            and (
              ${input.branchId}::text
                is null
              or exists (
                select 1
                from student_enrollments enrollment
                join school_branch_class_arms
                  branch_arm
                  on branch_arm.school_id =
                     enrollment.school_id
                 and branch_arm.class_arm_id =
                     enrollment.class_arm_id
                where
                  enrollment.school_id =
                    replacement.school_id
                  and enrollment.student_id =
                    replacement.student_id
                  and enrollment.status =
                    'ACTIVE'::student_enrollment_status
                  and branch_arm.branch_id =
                    ${input.branchId}::uuid
              )
            )
          order by
            replacement.created_at asc,
            replacement.id asc
          limit ${input.limit}
        `),
    ).map(
      (row) =>
        row.id,
    );

  const results = [];

  for (
    const caseId of
    caseIds
  ) {
    try {
      results.push(
        await produceReplacementCase({
          caseId,
          origin:
            input.origin,
        }),
      );
    } catch (error) {
      results.push({
        ok: false as const,
        status: 500 as const,
        code:
          "REPLACEMENT_PRODUCTION_FAILED",
        caseId,
        message:
          error instanceof Error
            ? error.message
            : "Replacement production failed.",
      });
    }
  }

  return {
    schoolId:
      input.schoolId,
    batchEligibleOn:
      input.batchEligibleOn,
    branchId:
      input.branchId,
    requested:
      caseIds.length,
    produced:
      results.filter(
        (result) =>
          result.ok,
      ).length,
    failed:
      results.filter(
        (result) =>
          !result.ok,
      ).length,
    results,
  };
}
