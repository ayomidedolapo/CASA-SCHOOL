import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "@/config/env";

export interface ArchiveStudentInput {
  schoolId: string;
  studentId: string;
  actorKind:
    | "SCHOOL_MEMBER"
    | "CASA_INTERNAL";
  actorMembershipId?:
    | string
    | null;
}

function rowsOf<T>(
  value: unknown,
): T[] {
  return Array.isArray(
    value,
  )
    ? value as T[]
    : [];
}

export async function archiveStudent(
  input:
    ArchiveStudentInput,
) {
  const sqlClient =
    neon(
      getDatabaseUrl(),
    );

  const result =
    await sqlClient`
      with target as (
        select
          id,
          status
        from students
        where
          school_id =
            ${input.schoolId}::uuid
          and id =
            ${input.studentId}::uuid
        for update
      ),
      archived as (
        update students student
        set
          status =
            'ARCHIVED'::student_status,
          exit_date =
            coalesce(
              student.exit_date,
              current_date
            ),
          updated_at =
            now()
        from target
        where
          student.school_id =
            ${input.schoolId}::uuid
          and student.id =
            target.id
          and student.status <>
            'ARCHIVED'::student_status
        returning
          student.id
      ),
      ended_enrollments as (
        update student_enrollments
        set
          status =
            'WITHDRAWN'::student_enrollment_status,
          ends_on =
            coalesce(
              ends_on,
              current_date
            ),
          updated_at =
            now()
        where
          school_id =
            ${input.schoolId}::uuid
          and student_id =
            ${input.studentId}::uuid
          and status =
            'ACTIVE'::student_enrollment_status
        returning id
      ),
      revoked_cards as (
        update student_identity_cards
        set
          status =
            'REVOKED'::student_identity_card_status,
          deactivated_at =
            coalesce(
              deactivated_at,
              now()
            ),
          updated_at =
            now()
        where
          school_id =
            ${input.schoolId}::uuid
          and student_id =
            ${input.studentId}::uuid
          and status in (
            'ACTIVE'::student_identity_card_status,
            'READY_FOR_ACTIVATION'::student_identity_card_status
          )
        returning
          id
      ),
      card_events as (
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
          ${input.schoolId}::uuid,
          ${input.studentId}::uuid,
          card.id,
          ${input.actorKind},
          ${input.actorMembershipId ?? null}::uuid,
          'REVOKED'::student_identity_card_event_type,
          'Student archived from the active school registry.',
          now()
        from revoked_cards card
        returning id
      ),
      released_lock as (
        delete from casa_internal_onboarding_locks
        where
          school_id =
            ${input.schoolId}::uuid
          and student_id =
            ${input.studentId}::uuid
        returning student_id
      )
      select
        target.id,
        target.status::text
          as previous_status,
        (
          select count(*)::int
          from archived
        ) as archived_count,
        (
          select count(*)::int
          from ended_enrollments
        ) as ended_enrollment_count,
        (
          select count(*)::int
          from revoked_cards
        ) as revoked_card_count,
        (
          select count(*)::int
          from card_events
        ) as card_event_count
      from target
    `;

  const row =
    rowsOf<{
      id: string;
      previous_status: string;
      archived_count: number;
      ended_enrollment_count:
        number;
      revoked_card_count:
        number;
      card_event_count:
        number;
    }>(
      result,
    )[0];

  if (!row) {
    return null;
  }

  return {
    studentId:
      row.id,
    archived:
      row.archived_count > 0 ||
      row.previous_status ===
        "ARCHIVED",
    replayed:
      row.previous_status ===
        "ARCHIVED",
    endedEnrollments:
      Number(
        row.ended_enrollment_count,
      ),
    revokedCards:
      Number(
        row.revoked_card_count,
      ),
  };
}
