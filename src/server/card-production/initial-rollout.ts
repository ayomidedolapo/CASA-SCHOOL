import { sql } from "drizzle-orm";

import { getDb } from "@/db";

import {
  ensureFirstStudentCardForEnrollmentInternal,
} from "./m38-lifecycle";

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
      (result as { rows?: unknown }).rows,
    )
  ) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

export type InitialCardRolloutState = {
  schoolId: string;
  completedAt: string | null;
  activeTemplate: boolean;
  activeStudents: number;
  activeEnrolledStudents: number;
  unenrolledStudents: number;
  missingFirstCards: number;
  scheduledFirstCards: number;
  readyNowFirstCards: number;
  canComplete: boolean;
  blockers: string[];
};

export async function getInitialCardRolloutState(
  input: {
    schoolId: string;
  },
): Promise<InitialCardRolloutState | null> {
  const db = getDb();

  const row =
    rowsOf<{
      school_id: string;
      completed_at:
        string | Date | null;
      completed_by_present:
        boolean;
      active_template:
        boolean;
      active_students:
        number;
      active_enrolled_students:
        number;
      unenrolled_students:
        number;
      missing_first_cards:
        number;
      scheduled_first_cards:
        number;
      ready_now_first_cards:
        number;
    }>(
      await db.execute(sql`
        select
          school.id::text
            as school_id,
          school.initial_card_rollout_completed_at
            as completed_at,
          (
            school.initial_card_rollout_completed_by_internal_membership_id
              is not null
          ) as completed_by_present,
          exists (
            select 1
            from student_card_templates template
            where
              template.school_id =
                school.id
              and template.status =
                'ACTIVE'::student_card_template_status
          ) as active_template,
          (
            select count(*)::int
            from students student
            where
              student.school_id =
                school.id
              and student.status =
                'ACTIVE'::student_status
          ) as active_students,
          (
            select count(
              distinct enrollment.student_id
            )::int
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
                school.id
              and enrollment.status =
                'ACTIVE'::student_enrollment_status
          ) as active_enrolled_students,
          (
            select count(*)::int
            from students student
            where
              student.school_id =
                school.id
              and student.status =
                'ACTIVE'::student_status
              and not exists (
                select 1
                from student_enrollments enrollment
                where
                  enrollment.school_id =
                    student.school_id
                  and enrollment.student_id =
                    student.id
                  and enrollment.status =
                    'ACTIVE'::student_enrollment_status
              )
          ) as unenrolled_students,
          (
            select count(
              distinct enrollment.student_id
            )::int
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
                school.id
              and enrollment.status =
                'ACTIVE'::student_enrollment_status
              and not exists (
                select 1
                from student_identity_cards card
                where
                  card.school_id =
                    enrollment.school_id
                  and card.student_id =
                    enrollment.student_id
              )
          ) as missing_first_cards,
          (
            select count(*)::int
            from student_card_production_jobs job
            join student_identity_cards card
              on card.school_id =
                 job.school_id
             and card.id =
                 job.card_id
            where
              job.school_id =
                school.id
              and job.production_authority in (
                'SCHOOL_ENROLLMENT_AUTO_ISSUE',
                'CASA_INTERNAL_INITIAL_ROLLOUT'
              )
              and job.status =
                'READY'::student_card_production_status
              and card.status =
                'READY_FOR_ACTIVATION'::student_identity_card_status
              and job.queued_at >
                now()
          ) as scheduled_first_cards,
          (
            select count(*)::int
            from student_card_production_jobs job
            join student_identity_cards card
              on card.school_id =
                 job.school_id
             and card.id =
                 job.card_id
            where
              job.school_id =
                school.id
              and job.production_authority in (
                'SCHOOL_ENROLLMENT_AUTO_ISSUE',
                'CASA_INTERNAL_INITIAL_ROLLOUT'
              )
              and job.status in (
                'READY'::student_card_production_status,
                'EXPORTED'::student_card_production_status
              )
              and card.status =
                'READY_FOR_ACTIVATION'::student_identity_card_status
              and job.queued_at <=
                now()
          ) as ready_now_first_cards
        from schools school
        where
          school.id =
            ${input.schoolId}::uuid
        limit 1
      `),
    )[0];

  if (!row) {
    return null;
  }

  const completedAt =
    row.completed_at &&
    row.completed_by_present
      ? (
          row.completed_at instanceof Date
            ? row.completed_at
            : new Date(
                row.completed_at,
              )
        ).toISOString()
      : null;
  const activeStudents =
    Number(
      row.active_students ??
        0,
    );
  const activeEnrolledStudents =
    Number(
      row.active_enrolled_students ??
        0,
    );
  const unenrolledStudents =
    Number(
      row.unenrolled_students ??
        0,
    );
  const missingFirstCards =
    Number(
      row.missing_first_cards ??
        0,
    );
  const scheduledFirstCards =
    Number(
      row.scheduled_first_cards ??
        0,
    );
  const readyNowFirstCards =
    Number(
      row.ready_now_first_cards ??
        0,
    );
  const blockers:
    string[] =
      [];

  if (!row.active_template) {
    blockers.push(
      "Activate the school's card template.",
    );
  }

  if (activeStudents < 1) {
    blockers.push(
      "Register the initial student population.",
    );
  }

  if (unenrolledStudents > 0) {
    blockers.push(
      `${unenrolledStudents} active student(s) still have no active enrollment.`,
    );
  }

  if (missingFirstCards > 0) {
    blockers.push(
      `${missingFirstCards} enrolled student(s) still have no first card.`,
    );
  }

  if (scheduledFirstCards > 0) {
    blockers.push(
      `${scheduledFirstCards} initial first-card job(s) are still incorrectly waiting for a future batch.`,
    );
  }

  return {
    schoolId:
      row.school_id,
    completedAt,
    activeTemplate:
      Boolean(
        row.active_template,
      ),
    activeStudents,
    activeEnrolledStudents,
    unenrolledStudents,
    missingFirstCards,
    scheduledFirstCards,
    readyNowFirstCards,
    canComplete:
      !completedAt &&
      blockers.length ===
        0,
    blockers,
  };
}

export async function reconcileInitialCardRollout(
  input: {
    schoolId: string;
    timezone: string;
    origin: string;
    limit?: number;
  },
) {
  const before =
    await getInitialCardRolloutState({
      schoolId:
        input.schoolId,
    });

  if (
    !before ||
    before.completedAt
  ) {
    return {
      skipped: true,
      releasedScheduled:
        0,
      attempted:
        0,
      created:
        0,
      alreadyPresent:
        0,
      deferred:
        0,
      failed:
        0,
      state:
        before,
    };
  }

  const db = getDb();

  const released =
    rowsOf<{
      id: string;
    }>(
      await db.execute(sql`
        update student_card_production_jobs job
        set
          queued_at =
            now(),
          updated_at =
            now()
        where
          job.school_id =
            ${input.schoolId}::uuid
          and job.production_authority in (
            'SCHOOL_ENROLLMENT_AUTO_ISSUE',
            'CASA_INTERNAL_INITIAL_ROLLOUT'
          )
          and job.status =
            'READY'::student_card_production_status
          and job.queued_at >
            now()
          and exists (
            select 1
            from student_identity_cards card
            where
              card.school_id =
                job.school_id
              and card.id =
                job.card_id
              and card.status =
                'READY_FOR_ACTIVATION'::student_identity_card_status
          )
        returning
          job.id::text
      `),
    ).length;

  const afterRelease =
    await getInitialCardRolloutState({
      schoolId:
        input.schoolId,
    });

  if (
    !afterRelease ||
    !afterRelease.activeTemplate
  ) {
    return {
      skipped: false,
      releasedScheduled:
        released,
      attempted:
        0,
      created:
        0,
      alreadyPresent:
        0,
      deferred:
        0,
      failed:
        0,
      state:
        afterRelease,
    };
  }

  const limit =
    Math.min(
      25,
      Math.max(
        1,
        input.limit ??
          5,
      ),
    );

  const missing =
    rowsOf<{
      student_id:
        string;
      enrollment_id:
        string;
    }>(
      await db.execute(sql`
        select distinct on (
          enrollment.student_id
        )
          enrollment.student_id::text,
          enrollment.id::text
            as enrollment_id
        from student_enrollments
          enrollment
        join students student
          on student.school_id =
             enrollment.school_id
         and student.id =
             enrollment.student_id
         and student.status =
             'ACTIVE'::student_status
        where
          enrollment.school_id =
            ${input.schoolId}::uuid
          and enrollment.status =
            'ACTIVE'::student_enrollment_status
          and not exists (
            select 1
            from student_identity_cards card
            where
              card.school_id =
                enrollment.school_id
              and card.student_id =
                enrollment.student_id
          )
        order by
          enrollment.student_id,
          enrollment.starts_on desc,
          enrollment.created_at desc
        limit ${limit}
      `),
    );

  let created =
    0;
  let alreadyPresent =
    0;
  let deferred =
    0;
  let failed =
    0;

  for (
    const student of
      missing
  ) {
    try {
      const result =
        await ensureFirstStudentCardForEnrollmentInternal({
          schoolId:
            input.schoolId,
          timezone:
            input.timezone,
          studentId:
            student.student_id,
          enrollmentId:
            student.enrollment_id,
          origin:
            input.origin,
        });

      if (
        result.status ===
          "CREATED"
      ) {
        created +=
          1;
      } else if (
        result.status ===
          "ALREADY_PRESENT"
      ) {
        alreadyPresent +=
          1;
      } else {
        deferred +=
          1;
      }
    } catch (error) {
      failed +=
        1;
      console.error(
        "Initial card rollout backfill failed",
        {
          schoolId:
            input.schoolId,
          studentId:
            student.student_id,
          error:
            error instanceof
              Error
              ? error.message
              : String(
                  error,
                ),
        },
      );
    }
  }

  return {
    skipped: false,
    releasedScheduled:
      released,
    attempted:
      missing.length,
    created,
    alreadyPresent,
    deferred,
    failed,
    state:
      await getInitialCardRolloutState({
        schoolId:
          input.schoolId,
      }),
  };
}

export async function reconcilePendingInitialCardRollouts(
  input: {
    origin: string;
    schoolLimit?: number;
    perSchoolLimit?: number;
  },
) {
  const db = getDb();
  const schoolLimit =
    Math.min(
      10,
      Math.max(
        1,
        input.schoolLimit ??
          2,
      ),
    );

  const schools =
    rowsOf<{
      id: string;
      timezone: string;
    }>(
      await db.execute(sql`
        select
          school.id::text,
          school.timezone
        from schools school
        where
          school.status =
            'ACTIVE'::school_status
          and school.initial_card_rollout_completed_at
            is null
          and (
            exists (
              select 1
              from student_card_templates template
              where
                template.school_id =
                  school.id
                and template.status =
                  'ACTIVE'::student_card_template_status
            )
            or exists (
              select 1
              from student_card_production_jobs job
              where
                job.school_id =
                  school.id
                and job.production_authority in (
                  'SCHOOL_ENROLLMENT_AUTO_ISSUE',
                  'CASA_INTERNAL_INITIAL_ROLLOUT'
                )
                and job.status =
                  'READY'::student_card_production_status
                and job.queued_at >
                  now()
            )
          )
        order by
          school.created_at asc
        limit ${schoolLimit}
      `),
    );

  let created =
    0;
  let releasedScheduled =
    0;
  let failed =
    0;

  for (
    const school of
      schools
  ) {
    try {
      const result =
        await reconcileInitialCardRollout({
          schoolId:
            school.id,
          timezone:
            school.timezone,
          origin:
            input.origin,
          limit:
            input.perSchoolLimit ??
            3,
        });

      created +=
        result.created;
      releasedScheduled +=
        result.releasedScheduled;
      failed +=
        result.failed;
    } catch (error) {
      failed +=
        1;
      console.error(
        "Initial rollout reconciliation failed",
        {
          schoolId:
            school.id,
          error:
            error instanceof
              Error
              ? error.message
              : String(
                  error,
                ),
        },
      );
    }
  }

  return {
    schoolsProcessed:
      schools.length,
    created,
    releasedScheduled,
    failed,
  };
}

export async function completeInitialCardRollout(
  input: {
    schoolId: string;
    internalMembershipId:
      string;
  },
) {
  const state =
    await getInitialCardRolloutState({
      schoolId:
        input.schoolId,
    });

  if (!state) {
    return {
      ok: false as const,
      status:
        404 as const,
      code:
        "SCHOOL_NOT_FOUND" as const,
      message:
        "School not found.",
      state:
        null,
    };
  }

  if (state.completedAt) {
    return {
      ok: true as const,
      alreadyCompleted:
        true,
      state,
    };
  }

  if (!state.canComplete) {
    return {
      ok: false as const,
      status:
        409 as const,
      code:
        "INITIAL_CARD_ROLLOUT_NOT_READY" as const,
      message:
        "Initial card rollout cannot be completed until every blocker is cleared.",
      state,
    };
  }

  const changed =
    rowsOf<{
      completed_at:
        string | Date;
    }>(
      await getDb().execute(sql`
        update schools
        set
          initial_card_rollout_completed_at =
            now(),
          initial_card_rollout_completed_by_internal_membership_id =
            ${input.internalMembershipId}::uuid,
          updated_at =
            now()
        where
          id =
            ${input.schoolId}::uuid
          and initial_card_rollout_completed_at
            is null
          and initial_card_rollout_completed_by_internal_membership_id
            is null
        returning
          initial_card_rollout_completed_at
            as completed_at
      `),
    )[0];

  if (!changed) {
    return {
      ok: false as const,
      status:
        409 as const,
      code:
        "INITIAL_CARD_ROLLOUT_STATE_CHANGED" as const,
      message:
        "Initial card rollout state changed before completion. Reload and review it again.",
      state:
        await getInitialCardRolloutState({
          schoolId:
            input.schoolId,
        }),
    };
  }

  return {
    ok: true as const,
    alreadyCompleted:
      false,
    state:
      await getInitialCardRolloutState({
        schoolId:
          input.schoolId,
      }),
  };
}
