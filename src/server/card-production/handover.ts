import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";

import {
  requireBranchAccess,
} from "@/server/school-operations/operations";

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

export class CardHandoverError
  extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "CardHandoverError";
  }
}

export async function requireStudentBranchCardAuthority(
  input: {
    schoolSlug: string;
    access: SchoolAccess;
    studentId: string;
  },
) {
  const db = getDb();

  const result = await db.execute(sql`
    select
      branch.id as branch_id
    from student_enrollments enrollment
    join school_branch_class_arms mapping
      on mapping.school_id =
         enrollment.school_id
     and mapping.class_arm_id =
         enrollment.class_arm_id
    join school_branches branch
      on branch.school_id =
         mapping.school_id
     and branch.id =
         mapping.branch_id
    where
      enrollment.school_id =
        ${input.access.school.id}::uuid
      and enrollment.student_id =
        ${input.studentId}::uuid
      and enrollment.status =
        'ACTIVE'::student_enrollment_status
      and enrollment.starts_on <=
        current_date
      and (
        enrollment.ends_on is null
        or enrollment.ends_on >=
           current_date
      )
      and branch.status =
        'ACTIVE'::school_branch_status
    order by enrollment.starts_on desc
    limit 1
  `);

  const row = rowsOf<{
    branch_id: string;
  }>(result)[0];

  if (!row) {
    throw new CardHandoverError(
      "The student has no active branch-scoped enrollment for card handover.",
      409,
      "CARD_HANDOVER_ACTIVE_BRANCH_REQUIRED",
    );
  }

  return requireBranchAccess(
    input.schoolSlug,
    row.branch_id,
  );
}

export async function activateStudentCardHandover(
  input: {
    access: SchoolAccess;
    branchId: string;
    studentId: string;
    cardId: string;
    reason: string | null;
  },
) {
  const db = getDb();
  const reason =
    input.reason?.trim() ||
    "Physical card handover confirmed";

  const result = await db.execute(sql`
    with candidate as (
      select
        card.id,
        card.school_id,
        card.student_id
      from student_identity_cards card
      join student_card_production_jobs job
        on job.school_id =
           card.school_id
       and job.card_id =
           card.id
       and job.student_id =
           card.student_id
      join student_enrollments enrollment
        on enrollment.school_id =
           card.school_id
       and enrollment.student_id =
           card.student_id
       and enrollment.status =
           'ACTIVE'::student_enrollment_status
       and enrollment.starts_on <=
           current_date
       and (
         enrollment.ends_on is null
         or enrollment.ends_on >=
            current_date
       )
      join school_branch_class_arms mapping
        on mapping.school_id =
           enrollment.school_id
       and mapping.class_arm_id =
           enrollment.class_arm_id
       and mapping.branch_id =
           ${input.branchId}::uuid
      where
        card.school_id =
          ${input.access.school.id}::uuid
        and card.student_id =
          ${input.studentId}::uuid
        and card.id =
          ${input.cardId}::uuid
        and card.status =
          'READY_FOR_ACTIVATION'::student_identity_card_status
        and job.status =
          'PRINTED'::student_card_production_status
        and exists (
          select 1
          from student_biometric_profiles profile
          where
            profile.school_id =
              card.school_id
            and profile.student_id =
              card.student_id
            and profile.status =
              'ACTIVE'::student_biometric_profile_status
        )
      order by job.created_at desc
      limit 1
    ),
    old_active as (
      update student_identity_cards old_card
      set
        status =
          'REPLACED'::student_identity_card_status,
        deactivated_at = now(),
        updated_at = now()
      where
        old_card.school_id =
          ${input.access.school.id}::uuid
        and old_card.student_id =
          ${input.studentId}::uuid
        and old_card.status =
          'ACTIVE'::student_identity_card_status
        and old_card.id <>
          ${input.cardId}::uuid
        and exists (
          select 1
          from candidate
        )
      returning
        old_card.id,
        old_card.school_id,
        old_card.student_id
    ),
    activated as (
      update student_identity_cards card
      set
        status =
          'ACTIVE'::student_identity_card_status,
        deactivated_at = null,
        updated_at = now()
      where
        card.school_id =
          ${input.access.school.id}::uuid
        and card.student_id =
          ${input.studentId}::uuid
        and card.id =
          ${input.cardId}::uuid
        and card.status =
          'READY_FOR_ACTIVATION'::student_identity_card_status
        and exists (
          select 1
          from candidate
        )
        and (
          not exists (
            select 1
            from student_identity_cards current_active
            where
              current_active.school_id =
                card.school_id
              and current_active.student_id =
                card.student_id
              and current_active.status =
                'ACTIVE'::student_identity_card_status
              and current_active.id <>
                card.id
          )
          or exists (
            select 1
            from old_active
          )
        )
      returning
        card.id,
        card.school_id,
        card.student_id,
        card.serial_number,
        card.status::text as status
    ),
    replaced_event as (
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
        old.school_id,
        old.student_id,
        old.id,
        'SCHOOL_MEMBER',
        ${input.access.membership.id}::uuid,
        'REPLACED'::student_identity_card_event_type,
        ${reason},
        now()
      from old_active old
      returning id
    ),
    activation_event as (
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
        card.school_id,
        card.student_id,
        card.id,
        'SCHOOL_MEMBER',
        ${input.access.membership.id}::uuid,
        'ACTIVATED'::student_identity_card_event_type,
        ${reason},
        now()
      from activated card
      returning id
    ),
    completed_replacement as (
      update student_card_replacement_cases replacement
      set
        replacement_card_id =
          activated.id,
        status =
          'COMPLETED'::student_card_replacement_case_status,
        completed_at = now(),
        completed_by_membership_id =
          ${input.access.membership.id}::uuid,
        updated_at = now()
      from activated
      where
        replacement.school_id =
          activated.school_id
        and replacement.student_id =
          activated.student_id
        and replacement.status =
          'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
      returning replacement.id
    )
    select
      activated.id,
      activated.serial_number,
      activated.status,
      (
        select count(*)::int
        from old_active
      ) as replaced_card_count,
      (
        select count(*)::int
        from completed_replacement
      ) as completed_replacement_count
    from activated
    where exists (
      select 1
      from activation_event
    )
  `);

  const card = rowsOf<{
    id: string;
    serial_number: string;
    status: "ACTIVE";
    replaced_card_count: number;
    completed_replacement_count: number;
  }>(result)[0];

  if (!card) {
    const stateResult =
      await db.execute(sql`
        select
          card.status::text as status,
          job.status::text as production_status,
          exists (
            select 1
            from student_biometric_profiles profile
            where
              profile.school_id =
                card.school_id
              and profile.student_id =
                card.student_id
              and profile.status =
                'ACTIVE'::student_biometric_profile_status
          ) as face_ready
        from student_identity_cards card
        left join student_card_production_jobs job
          on job.school_id =
             card.school_id
         and job.card_id =
             card.id
        where
          card.school_id =
            ${input.access.school.id}::uuid
          and card.student_id =
            ${input.studentId}::uuid
          and card.id =
            ${input.cardId}::uuid
        order by job.created_at desc
        limit 1
      `);

    const state = rowsOf<{
      status: string;
      production_status:
        string | null;
      face_ready: boolean;
    }>(stateResult)[0];

    if (!state) {
      throw new CardHandoverError(
        "Student card not found.",
        404,
        "CARD_NOT_FOUND",
      );
    }

    if (
      state.status ===
      "ACTIVE"
    ) {
      return {
        card: {
          id: input.cardId,
          status: "ACTIVE" as const,
        },
        alreadyActive: true,
      };
    }

    if (
      state.status ===
        "READY_FOR_ACTIVATION" &&
      !state.face_ready
    ) {
      throw new CardHandoverError(
        "Complete face enrollment before physical handover activation.",
        409,
        "CARD_ACTIVE_FACE_REQUIRED",
      );
    }

    if (
      state.status ===
        "READY_FOR_ACTIVATION" &&
      state.production_status !==
        "PRINTED"
    ) {
      throw new CardHandoverError(
        "The physical card must be marked PRINTED before handover activation.",
        409,
        "CARD_PRINTED_HANDOVER_REQUIRED",
      );
    }

    throw new CardHandoverError(
      "The card is not eligible for physical handover activation.",
      409,
      "CARD_HANDOVER_STATE_CHANGED",
    );
  }

  return {
    card: {
      id: card.id,
      serialNumber:
        card.serial_number,
      status:
        "ACTIVE" as const,
    },
    alreadyActive: false,
    replacedPreviousCard:
      card.replaced_card_count > 0,
    completedReplacementCase:
      card.completed_replacement_count > 0,
  };
}
