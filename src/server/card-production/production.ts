import {
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  and,
  desc,
  eq,
  sql,
  type SQL,
} from "drizzle-orm";

import { getDb } from "@/db";
import {
  studentCardProductionJobs,
  studentCardTemplates,
  studentIdentityCards,
  type StudentCardRenderSnapshot,
} from "@/db/schema";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";
import {
  consumePasskeyStepUpGrantWithId,
  type PasskeyStepUpAction,
} from "@/server/auth/passkey-step-up";
import {
  createStudentCardCredential,
} from "@/server/identity/student-card";
import {
  emitCasaOperationalNotificationBestEffort,
} from "@/server/internal/operational-notifications";

import {
  deletePrivateCardObjectsBestEffort,
  assertCardStorageConfigured,
} from "./storage";
import {
  parseCardTemplateLayout,
} from "./template-layout";
import {
  renderAndStoreStudentCard,
} from "./render";

export function createCardPublicAccessKey():
  string {
  return randomBytes(
    32,
  ).toString(
    "base64url",
  );
}

export function publicCardPath(
  publicAccessKey:
    string,
): string {
  return `/id-card/${publicAccessKey}`;
}

export function publicCardUrl(
  origin:
    string,
  publicAccessKey:
    string,
): string {
  return new URL(
    publicCardPath(
      publicAccessKey,
    ),
    origin,
  ).toString();
}

export type CardProductionAction =
  | "CARD_ISSUE"
  | "CARD_REISSUE";

export function asArrayRow<T>(
  result: unknown,
): T | null {
  if (Array.isArray(result)) {
    return (
      (result[0] as T | undefined) ??
      null
    );
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result
  ) {
    const rows =
      (
        result as {
          rows?: unknown;
        }
      ).rows;

    if (Array.isArray(rows)) {
      return (
        (rows[0] as T | undefined) ??
        null
      );
    }
  }

  return null;
}

export async function getActiveCardTemplate(
  schoolId: string,
) {
  const db = getDb();

  const rows =
    await db
      .select({
        id:
          studentCardTemplates.id,
        versionLabel:
          studentCardTemplates.versionLabel,
        frontSourceKey:
          studentCardTemplates.frontSourceKey,
        backSourceKey:
          studentCardTemplates.backSourceKey,
        layout:
          studentCardTemplates.layout,
      })
      .from(
        studentCardTemplates,
      )
      .where(
        and(
          eq(
            studentCardTemplates.schoolId,
            schoolId,
          ),
          eq(
            studentCardTemplates.status,
            "ACTIVE",
          ),
        ),
      )
      .limit(1);

  const template =
    rows[0] ??
    null;

  if (template) {
    parseCardTemplateLayout(
      template.layout,
    );
  }

  return template;
}

export async function getStudentCardProductionJobs(
  input: {
    schoolId:
      string;
    studentId:
      string;
    origin:
      string;
  },
) {
  const db = getDb();

  const rows =
    await db
      .select({
        id:
          studentCardProductionJobs.id,
        cardId:
          studentCardProductionJobs.cardId,
        status:
          studentCardProductionJobs.status,
        publicAccessKey:
          studentCardProductionJobs.publicAccessKey,
        publicLinkRevision:
          studentCardProductionJobs.publicLinkRevision,
        renderSnapshot:
          studentCardProductionJobs.renderSnapshot,
        queuedAt:
          studentCardProductionJobs.queuedAt,
        exportedAt:
          studentCardProductionJobs.exportedAt,
        printedAt:
          studentCardProductionJobs.printedAt,
        templateVersion:
          studentCardTemplates.versionLabel,
      })
      .from(
        studentCardProductionJobs,
      )
      .innerJoin(
        studentCardTemplates,
        eq(
          studentCardTemplates.id,
          studentCardProductionJobs.templateId,
        ),
      )
      .where(
        and(
          eq(
            studentCardProductionJobs.schoolId,
            input.schoolId,
          ),
          eq(
            studentCardProductionJobs.studentId,
            input.studentId,
          ),
        ),
      )
      .orderBy(
        desc(
          studentCardProductionJobs.queuedAt,
        ),
      )
      .limit(50);

  return rows.map(
    (row) => ({
      id:
        row.id,
      cardId:
        row.cardId,
      status:
        row.status,
      publicLinkRevision:
        row.publicLinkRevision,
      renderSnapshot:
        row.renderSnapshot,
      queuedAt:
        row.queuedAt,
      exportedAt:
        row.exportedAt,
      printedAt:
        row.printedAt,
      templateVersion:
        row.templateVersion,
      publicUrl:
        publicCardUrl(
          input.origin,
          row.publicAccessKey,
        ),
    }),
  );
}

export async function getStudentSnapshotSource(
  input: {
    schoolId:
      string;
    studentId:
      string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        s.id,
        s.casa_student_id,
        s.admission_number,
        s.first_name,
        s.middle_name,
        s.last_name,
        s.date_of_birth,
        s.sex::text as sex,
        school.name as school_name,
        class_data.class_name,
        class_data.academic_session_name,
        class_data.branch_id,
        class_data.branch_name
      from students s
      join schools school
        on school.id =
          s.school_id
      left join lateral (
        select
          concat_ws(
            ' ',
            cl.name,
            ca.name
          ) as class_name,
          academic_session.name
            as academic_session_name,
          branch.id as branch_id,
          branch.name as branch_name
        from student_enrollments e
        join academic_sessions
          academic_session
          on academic_session.school_id =
            e.school_id
          and academic_session.id =
            e.academic_session_id
        join class_arms ca
          on ca.school_id =
            e.school_id
          and ca.id =
            e.class_arm_id
        join class_levels cl
          on cl.school_id =
            ca.school_id
          and cl.id =
            ca.class_level_id
        left join school_branch_class_arms branch_arm
          on branch_arm.school_id =
            e.school_id
          and branch_arm.class_arm_id =
            e.class_arm_id
        left join school_branches branch
          on branch.school_id =
            e.school_id
          and branch.id =
            branch_arm.branch_id
        where
          e.school_id =
            s.school_id
          and e.student_id =
            s.id
          and e.status =
            'ACTIVE'::student_enrollment_status
        order by
          e.starts_on desc
        limit 1
      ) class_data on true
      where
        s.school_id =
          ${input.schoolId}::uuid
        and s.id =
          ${input.studentId}::uuid
        and s.status =
          'ACTIVE'::student_status
      limit 1
    `);

  return asArrayRow<{
    id: string;
    casa_student_id:
      string;
    admission_number:
      string | null;
    first_name:
      string;
    middle_name:
      string | null;
    last_name:
      string;
    date_of_birth:
      string;
    sex:
      string;
    school_name:
      string;
    class_name:
      string | null;
    academic_session_name:
      string | null;
    branch_id:
      string | null;
    branch_name:
      string | null;
  }>(
    result,
  );
}

export async function produceStudentCard(
  input: {
    access:
      SchoolAccess;
    studentId:
      string;
    stepUpToken:
      string | null;
    reason:
      string | null;
    origin:
      string;
  },
) {
    const db = getDb();

  const pendingReplacement =
    asArrayRow<{
      id: string;
    }>(
      await db.execute(sql`
        select id
        from student_card_replacement_cases
        where
          school_id =
            ${input.access.school.id}::uuid
          and student_id =
            ${input.studentId}::uuid
          and status =
            'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
        limit 1
      `),
    );

  if (pendingReplacement) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "CARD_REPLACEMENT_BATCH_REQUIRED",
    };
  }

  const [
    student,
    activeTemplate,
    activeCards,
    previousCards,
  ] =
    await Promise.all([
      getStudentSnapshotSource({
        schoolId:
          input.access.school.id,
        studentId:
          input.studentId,
      }),
      getActiveCardTemplate(
        input.access.school.id,
      ),
      db
        .select({
          id:
            studentIdentityCards.id,
        })
        .from(
          studentIdentityCards,
        )
        .where(
          and(
            eq(
              studentIdentityCards.schoolId,
              input.access.school.id,
            ),
            eq(
              studentIdentityCards.studentId,
              input.studentId,
            ),
            eq(
              studentIdentityCards.status,
              "ACTIVE",
            ),
          ),
        )
        .limit(1),
      db
        .select({
          id:
            studentIdentityCards.id,
        })
        .from(
          studentIdentityCards,
        )
        .where(
          and(
            eq(
              studentIdentityCards.schoolId,
              input.access.school.id,
            ),
            eq(
              studentIdentityCards.studentId,
              input.studentId,
            ),
          ),
        )
        .limit(1),
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
    await emitCasaOperationalNotificationBestEffort({
      event:
        "CARD_PRODUCTION_CONFIGURATION_FAILURE",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          input.access.school.id,
        branchId:
          student.branch_id,
      },
      title:
        "Card production template missing",
      body:
        "Card production cannot continue because the school does not have an active card template.",
      actionUrl:
        "/internal/templates",
      dedupKey:
        `card-template-missing:${input.access.school.id}`,
      payload: {
        studentId:
          input.studentId,
      },
    });

    return {
      ok: false as const,
      status: 503 as const,
      code:
        "ACTIVE_CARD_TEMPLATE_REQUIRED",
    };
  }

  try {
    assertCardStorageConfigured();
  } catch {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "CARD_PRODUCTION_CONFIGURATION_FAILURE",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          input.access.school.id,
        branchId:
          student.branch_id,
      },
      title:
        "Card storage is not configured",
      body:
        "Card rendering cannot continue because the private card-storage configuration is unavailable.",
      actionUrl:
        "/internal/health",
      dedupKey:
        "card-storage:not-configured",
      payload: {
        studentId:
          input.studentId,
      },
    });

    return {
      ok: false as const,
      status: 503 as const,
      code:
        "CARD_STORAGE_NOT_CONFIGURED",
    };
  }

  const requiredStudentName =
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

  if (
    !requiredStudentName ||
    !student.school_name?.trim() ||
    !student.class_name?.trim() ||
    ![
      "MALE",
      "FEMALE",
    ].includes(
      student.sex,
    )
  ) {
    return {
      ok: false as const,
      status: 422 as const,
      code:
        "CARD_VISIBLE_DATA_INCOMPLETE",
    };
  }

  const activeCard =
    activeCards[0] ??
    null;

  const pendingCards =
    await db
      .select({
        id:
          studentIdentityCards.id,
      })
      .from(
        studentIdentityCards,
      )
      .where(
        and(
          eq(
            studentIdentityCards.schoolId,
            input.access.school.id,
          ),
          eq(
            studentIdentityCards.studentId,
            input.studentId,
          ),
          eq(
            studentIdentityCards.status,
            "READY_FOR_ACTIVATION",
          ),
        ),
      )
      .limit(1);

  if (pendingCards[0]) {
    return {
      ok: false as const,
      status: 409 as const,
      code:
        "CARD_AWAITING_HANDOVER",
      cardId:
        pendingCards[0].id,
    };
  }

  const previousCard =
    previousCards[0] ??
    null;

  const action:
    CardProductionAction =
      previousCard
        ? "CARD_REISSUE"
        : "CARD_ISSUE";

  const reason =
    input.reason
      ?.trim() ||
    null;

  if (
    action ===
      "CARD_REISSUE" &&
    (
      !reason ||
      reason.length <
        3
    )
  ) {
    return {
      ok: false as const,
      status: 400 as const,
      code:
        "CARD_REISSUE_REASON_REQUIRED",
    };
  }

  if (
    !input.stepUpToken
  ) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "PASSKEY_STEP_UP_REQUIRED",
      requiredAction:
        action,
    };
  }

  const passkeyGrantId =
    await consumePasskeyStepUpGrantWithId({
      token:
        input.stepUpToken,
      access:
        input.access,
      action:
        action as
          PasskeyStepUpAction,
    });

  if (!passkeyGrantId) {
    return {
      ok: false as const,
      status: 403 as const,
      code:
        "PASSKEY_STEP_UP_REQUIRED",
      requiredAction:
        action,
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

  const studentName =
    [
      student.first_name,
      student.middle_name,
      student.last_name,
    ]
      .filter(
        Boolean,
      )
      .join(" ");

  const snapshot:
    StudentCardRenderSnapshot =
      {
        schoolName:
          student.school_name,
        studentName,
        casaStudentId:
          student.casa_student_id,
        admissionNumber:
          student.admission_number,
        dateOfBirth:
          student.date_of_birth,
        sex:
          student.sex ===
          "MALE"
            ? "M"
            : student.sex ===
                "FEMALE"
              ? "F"
              : "",
        className:
          student.class_name,
        branchId:
          student.branch_id,
        branchName:
          student.branch_name,
        academicSession:
          null,
        cardSerial:
          credential.serialNumber,
        templateVersion:
          activeTemplate.versionLabel,
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
            activeTemplate.frontSourceKey,
          backSourceKey:
            activeTemplate.backSourceKey,
          layout:
            activeTemplate.layout,
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

    const grantAction =
      action;

    const result =
      await db.execute(sql`
        with verified_grant as (
          select id
          from auth_passkey_step_up_grants
          where
            id =
              ${passkeyGrantId}::uuid
            and school_id =
              ${input.access.school.id}::uuid
            and membership_id =
              ${input.access.membership.id}::uuid
            and action =
              ${grantAction}
            and consumed_at is not null
        ),
        state_guard as (
          select 1
          where
            exists (
              select 1
              from verified_grant
            )
            and not exists (
              select 1
              from student_identity_cards pending
              where
                pending.school_id =
                  ${input.access.school.id}::uuid
                and pending.student_id =
                  ${input.studentId}::uuid
                and pending.status =
                  'READY_FOR_ACTIVATION'::student_identity_card_status
            )
            and (
              (
                ${activeCard?.id ?? null}::uuid is null
                and not exists (
                  select 1
                  from student_identity_cards active
                  where
                    active.school_id =
                      ${input.access.school.id}::uuid
                    and active.student_id =
                      ${input.studentId}::uuid
                    and active.status =
                      'ACTIVE'::student_identity_card_status
                )
              )
              or exists (
                select 1
                from student_identity_cards active
                where
                  active.school_id =
                    ${input.access.school.id}::uuid
                  and active.student_id =
                    ${input.studentId}::uuid
                  and active.id =
                    ${activeCard?.id ?? null}::uuid
                  and active.status =
                    'ACTIVE'::student_identity_card_status
              )
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
          from verified_grant
          cross join state_guard
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
            ${reason},
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
            issued_by_membership_id,
            passkey_grant_id,
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
            ${activeTemplate.id}::uuid,
            ${input.access.membership.id}::uuid,
            verified_grant.id,
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
          cross join verified_grant
          where exists (
            select 1
            from lifecycle_event
          )
          returning
            id,
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
            ${input.access.school.id}::uuid,
            inserted_job.id,
            'SCHOOL_MEMBER'::student_card_production_actor_kind,
            ${input.access.membership.id}::uuid,
            'CARD_PRODUCTION_READY'::student_card_production_event_type,
            ${reason},
            ${now}::timestamptz,
            ${now}::timestamptz
          from inserted_job
          returning id
        )
        select
          inserted_job.id,
          inserted_job.card_id,
          inserted_job.status,
          inserted_job.public_access_key,
          inserted_job.queued_at
        from inserted_job
        where exists (
          select 1
          from production_event
        )
      `);

    const row =
      asArrayRow<{
        id:
          string;
        card_id:
          string;
        status:
          "READY";
        public_access_key:
          string;
        queued_at:
          Date;
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
          "CARD_IDENTITY_STATE_CHANGED",
      };
    }

    return {
      ok: true as const,
      action,
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
          row.id,
        status:
          row.status,
        templateVersion:
          activeTemplate.versionLabel,
        queuedAt:
          row.queued_at,
        publicUrl:
          publicCardUrl(
            input.origin,
            row.public_access_key,
          ),
      },
    };
  } catch (
    error
  ) {
    if (artifacts) {
      await deletePrivateCardObjectsBestEffort(
        [
          artifacts.front,
          artifacts.back,
          artifacts.preview,
        ],
      );
    }

    await emitCasaOperationalNotificationBestEffort({
      event:
        "CARD_PRODUCTION_FAILURE",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          input.access.school.id,
        branchId:
          student.branch_id,
      },
      title:
        "Card production failed",
      body:
        `Card rendering or storage failed for student ${student.casa_student_id}.`,
      actionUrl:
        "/internal/card-production",
      dedupKey:
        `card-production-failure:${jobId}`,
      payload: {
        studentId:
          input.studentId,
        casaStudentId:
          student.casa_student_id,
        jobId,
        action,
        errorName:
          error instanceof Error
            ? error.name
            : "UnknownError",
      },
    });

    throw error;
  }
}

export async function listCentralProductionJobs(
  input: {
    status:
      "READY" |
      "EXPORTED" |
      "PRINTED" |
      null;
    schoolId:
      string | null;
    branchId?:
      string | null;
    limit:
      number;
    origin:
      string;
  },
) {
  const db = getDb();

  const conditions:
    SQL<unknown>[] =
      [];

  if (
    input.status
  ) {
    conditions.push(
      eq(
        studentCardProductionJobs.status,
        input.status,
      ),
    );
  }

  if (
    input.schoolId
  ) {
    conditions.push(
      eq(
        studentCardProductionJobs.schoolId,
        input.schoolId,
      ),
    );
  }

  if (
    input.branchId
  ) {
    conditions.push(
      sql`${studentCardProductionJobs.renderSnapshot} ->> 'branchId' = ${input.branchId}`,
    );
  }

  const rows =
    await db
      .select({
        id:
          studentCardProductionJobs.id,
        schoolId:
          studentCardProductionJobs.schoolId,
        studentId:
          studentCardProductionJobs.studentId,
        cardId:
          studentCardProductionJobs.cardId,
        status:
          studentCardProductionJobs.status,
        publicAccessKey:
          studentCardProductionJobs.publicAccessKey,
        publicLinkRevision:
          studentCardProductionJobs.publicLinkRevision,
        frontArtifactKey:
          studentCardProductionJobs.frontArtifactKey,
        backArtifactKey:
          studentCardProductionJobs.backArtifactKey,
        previewArtifactKey:
          studentCardProductionJobs.previewArtifactKey,
        renderSnapshot:
          studentCardProductionJobs.renderSnapshot,
        queuedAt:
          studentCardProductionJobs.queuedAt,
        exportedAt:
          studentCardProductionJobs.exportedAt,
        printedAt:
          studentCardProductionJobs.printedAt,
        templateVersion:
          studentCardTemplates.versionLabel,
      })
      .from(
        studentCardProductionJobs,
      )
      .innerJoin(
        studentCardTemplates,
        eq(
          studentCardTemplates.id,
          studentCardProductionJobs.templateId,
        ),
      )
      .where(
        conditions.length > 0
          ? and(
              ...conditions,
            )
          : undefined
      )
      .orderBy(
        desc(
          studentCardProductionJobs.queuedAt,
        ),
      )
      .limit(
        input.limit,
      );

  return rows.map(
    (row) => ({
      ...row,
      publicUrl:
        publicCardUrl(
          input.origin,
          row.publicAccessKey,
        ),
    }),
  );
}

export async function markProductionJobPrinted(
  input: {
    jobId:
      string;
    reason:
      string | null;
  },
) {
  const db = getDb();
  const now =
    new Date()
      .toISOString();

  const result =
    await db.execute(sql`
      with changed as (
        update student_card_production_jobs
        set
          status =
            'PRINTED'::student_card_production_status,
          exported_at =
            coalesce(
              exported_at,
              ${now}::timestamptz
            ),
          printed_at =
            coalesce(
              printed_at,
              ${now}::timestamptz
            ),
          updated_at =
            ${now}::timestamptz
        where
          id =
            ${input.jobId}::uuid
          and status in (
            'READY'::student_card_production_status,
            'EXPORTED'::student_card_production_status,
            'PRINTED'::student_card_production_status
          )
        returning
          id,
          school_id,
          status,
          printed_at
      ),
      event as (
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
          changed.school_id,
          changed.id,
          'CASA_INTERNAL'::student_card_production_actor_kind,
          null,
          'CARD_PRODUCTION_PRINTED'::student_card_production_event_type,
          ${input.reason},
          ${now}::timestamptz,
          ${now}::timestamptz
        from changed
        where not exists (
          select 1
          from student_card_production_events existing
          where
            existing.job_id =
              changed.id
            and existing.event_type =
              'CARD_PRODUCTION_PRINTED'::student_card_production_event_type
        )
        returning id
      )
      select
        changed.id,
        changed.status,
        changed.printed_at
      from changed
    `);

  return asArrayRow<{
    id:
      string;
    status:
      "PRINTED";
    printed_at:
      Date;
  }>(
    result,
  );
}

export async function rotateProductionPublicLink(
  input: {
    jobId:
      string;
    reason:
      string | null;
    origin:
      string;
  },
) {
  const db = getDb();
  const now =
    new Date()
      .toISOString();
  const publicAccessKey =
    createCardPublicAccessKey();

  const result =
    await db.execute(sql`
      with changed as (
        update student_card_production_jobs
        set
          public_access_key =
            ${publicAccessKey},
          public_link_revision =
            public_link_revision + 1,
          updated_at =
            ${now}::timestamptz
        where
          id =
            ${input.jobId}::uuid
        returning
          id,
          school_id,
          public_access_key,
          public_link_revision
      ),
      event as (
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
          changed.school_id,
          changed.id,
          'CASA_INTERNAL'::student_card_production_actor_kind,
          null,
          'PUBLIC_LINK_ROTATED'::student_card_production_event_type,
          ${input.reason},
          ${now}::timestamptz,
          ${now}::timestamptz
        from changed
        returning id
      )
      select
        changed.id,
        changed.public_access_key,
        changed.public_link_revision
      from changed
      where exists (
        select 1
        from event
      )
    `);

  const row =
    asArrayRow<{
      id:
        string;
      public_access_key:
        string;
      public_link_revision:
        number;
    }>(
      result,
    );

  if (!row) {
    return null;
  }

  return {
    id:
      row.id,
    publicLinkRevision:
      row.public_link_revision,
    publicUrl:
      publicCardUrl(
        input.origin,
        row.public_access_key,
      ),
  };
}

export async function markJobsExported(
  jobIds:
    string[],
) {
  if (
    jobIds.length ===
    0
  ) {
    return;
  }

  const db = getDb();
  const now =
    new Date()
      .toISOString();

  const idsJson =
    JSON.stringify(
      jobIds,
    );

  await db.execute(sql`
    with selected_ids as (
      select
        value::uuid as id
      from jsonb_array_elements_text(
        ${idsJson}::jsonb
      )
    ),
    changed as (
      update student_card_production_jobs j
      set
        status =
          case
            when j.status =
              'READY'::student_card_production_status
            then
              'EXPORTED'::student_card_production_status
            else
              j.status
          end,
        exported_at =
          coalesce(
            j.exported_at,
            ${now}::timestamptz
          ),
        updated_at =
          ${now}::timestamptz
      from selected_ids selected
      where
        j.id =
          selected.id
        and j.status in (
          'READY'::student_card_production_status,
          'EXPORTED'::student_card_production_status,
          'PRINTED'::student_card_production_status
        )
      returning
        j.id,
        j.school_id
    )
    insert into student_card_production_events (
      school_id,
      job_id,
      actor_kind,
      actor_membership_id,
      event_type,
      occurred_at,
      created_at
    )
    select
      changed.school_id,
      changed.id,
      'CASA_INTERNAL'::student_card_production_actor_kind,
      null,
      'CARD_PRODUCTION_EXPORTED'::student_card_production_event_type,
      ${now}::timestamptz,
      ${now}::timestamptz
    from changed
    where not exists (
      select 1
      from student_card_production_events existing
      where
        existing.job_id =
          changed.id
        and existing.event_type =
          'CARD_PRODUCTION_EXPORTED'::student_card_production_event_type
    )
  `);
}
