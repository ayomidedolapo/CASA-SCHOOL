import {
  sql,
} from "drizzle-orm";

import {
  getDb,
} from "@/db";

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

export async function resolveFirstCardQueueSchedule(
  input: {
    schoolId: string;
    enrollmentId: string;
    timezone: string;
  },
) {
  const row =
    rowsOf<{
      scheduled_for:
        string | null;
      queue_at:
        string | Date;
    }>(
      await getDb()
        .execute(sql`
          with context as (
            select
              enrollment.id,
              enrollment.academic_session_id,
              (
                now() at time zone
                  ${input.timezone}
              )::date as school_today
            from student_enrollments
              enrollment
            where
              enrollment.school_id =
                ${input.schoolId}::uuid
              and enrollment.id =
                ${input.enrollmentId}::uuid
              and enrollment.status =
                'ACTIVE'::student_enrollment_status
            limit 1
          ),
          current_term as (
            select
              term.starts_on,
              term.ends_on,
              context.school_today
            from context
            join academic_terms term
              on term.school_id =
                 ${input.schoolId}::uuid
             and term.academic_session_id =
                 context.academic_session_id
             and term.status <>
                 'CLOSED'::academic_period_status
             and context.school_today between
                 term.starts_on and term.ends_on
            order by
              term.position asc
            limit 1
          )
          select
            case
              when current_term.school_today >
                   current_term.starts_on
                then
                  current_term.ends_on::text
              else
                null
            end as scheduled_for,
            case
              when current_term.school_today >
                   current_term.starts_on
                then
                  (
                    current_term.ends_on::timestamp
                    at time zone
                      ${input.timezone}
                  )
              else
                now()
            end as queue_at
          from context
          left join current_term
            on true
          limit 1
        `),
    )[0];

  return {
    scheduledFor:
      row?.scheduled_for ??
      null,
    queueAt:
      new Date(
        row?.queue_at ??
          new Date(),
      ).toISOString(),
  };
}

export async function listScheduledFirstCardGroups(
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
    scheduled_for:
      string;
    student_count:
      number;
    students:
      Array<{
        job_id: string;
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
      }>;
  }>(
    await getDb()
      .execute(sql`
        select
          job.school_id::text
            as school_id,
          school.name
            as school_name,
          (
            job.queued_at at time zone
              school.timezone
          )::date::text
            as scheduled_for,
          count(*)::int
            as student_count,
          jsonb_agg(
            jsonb_build_object(
              'job_id',
                job.id::text,
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
                nullif(
                  job.render_snapshot ->>
                    'branchId',
                  ''
                ),
              'branch_name',
                nullif(
                  job.render_snapshot ->>
                    'branchName',
                  ''
                ),
              'class_name',
                nullif(
                  job.render_snapshot ->>
                    'className',
                  ''
                )
            )
            order by
              student.last_name,
              student.first_name,
              student.casa_student_id
          ) as students
        from student_card_production_jobs
          job
        join schools
          school
          on school.id =
             job.school_id
        join students
          student
          on student.school_id =
             job.school_id
         and student.id =
             job.student_id
        join student_identity_cards
          card
          on card.school_id =
             job.school_id
         and card.id =
             job.card_id
        where
          job.production_authority =
            'SCHOOL_ENROLLMENT_AUTO_ISSUE'
          and job.status =
            'READY'::student_card_production_status
          and job.queued_at >
            now()
          and card.status =
            'READY_FOR_ACTIVATION'::student_identity_card_status
          and (
            ${input.schoolId}::uuid
              is null
            or job.school_id =
               ${input.schoolId}::uuid
          )
          and (
            ${input.branchId}::text
              is null
            or job.render_snapshot ->>
                 'branchId' =
               ${input.branchId}
          )
        group by
          job.school_id,
          school.name,
          school.timezone,
          (
            job.queued_at at time zone
              school.timezone
          )::date
        order by
          (
            job.queued_at at time zone
              school.timezone
          )::date asc,
          school.name asc
        limit 1000
      `),
  );
}
