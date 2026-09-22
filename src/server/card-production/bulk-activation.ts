import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";
import {
  consumePasskeyStepUpGrantWithId,
} from "@/server/auth/passkey-step-up";

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

export interface BulkCardActivationReadiness {
  activeCount: number;
  totalReadyCards: number;
  eligibleCount: number;
  awaitingPrintCount: number;
  awaitingFaceCount: number;
  manualReviewCount: number;
}

export class BulkCardActivationError
  extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "BulkCardActivationError";
  }
}

export async function getBranchBulkCardActivationReadiness(
  input: {
    access: SchoolAccess;
    branchId: string;
  },
): Promise<BulkCardActivationReadiness> {
  const db = getDb();

  const result = await db.execute(sql`
    with scoped_cards as (
      select distinct on (card.id)
        card.id,
        card.student_id,
        coalesce(
          latest_job.status::text,
          'MISSING'
        ) as production_status,
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
        ) as face_ready,
        exists (
          select 1
          from student_identity_cards active_card
          where
            active_card.school_id =
              card.school_id
            and active_card.student_id =
              card.student_id
            and active_card.id <>
              card.id
            and active_card.status =
              'ACTIVE'::student_identity_card_status
        ) as has_active_card,
        exists (
          select 1
          from student_card_replacement_cases replacement
          where
            replacement.school_id =
              card.school_id
            and replacement.student_id =
              card.student_id
            and replacement.status =
              'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
        ) as replacement_pending
      from student_identity_cards card
      join students student
        on student.school_id =
           card.school_id
       and student.id =
           card.student_id
       and student.status =
           'ACTIVE'::student_status
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
      left join lateral (
        select job.status
        from student_card_production_jobs job
        where
          job.school_id =
            card.school_id
          and job.student_id =
            card.student_id
          and job.card_id =
            card.id
        order by job.created_at desc
        limit 1
      ) latest_job on true
      where
        card.school_id =
          ${input.access.school.id}::uuid
        and card.status =
          'READY_FOR_ACTIVATION'::student_identity_card_status
      order by
        card.id,
        enrollment.starts_on desc
    )
    select
      (
        select
          count(
            distinct active_card.student_id
          )::int
        from student_identity_cards active_card
        join students active_student
          on active_student.school_id =
             active_card.school_id
         and active_student.id =
             active_card.student_id
         and active_student.status =
             'ACTIVE'::student_status
        join student_enrollments active_enrollment
          on active_enrollment.school_id =
             active_card.school_id
         and active_enrollment.student_id =
             active_card.student_id
         and active_enrollment.status =
             'ACTIVE'::student_enrollment_status
         and active_enrollment.starts_on <=
             current_date
         and (
           active_enrollment.ends_on is null
           or active_enrollment.ends_on >=
              current_date
         )
        join school_branch_class_arms active_mapping
          on active_mapping.school_id =
             active_enrollment.school_id
         and active_mapping.class_arm_id =
             active_enrollment.class_arm_id
         and active_mapping.branch_id =
             ${input.branchId}::uuid
        where
          active_card.school_id =
            ${input.access.school.id}::uuid
          and active_card.status =
            'ACTIVE'::student_identity_card_status
      ) as active_count,
      count(*)::int as total_ready_cards,
      count(*) filter (
        where
          production_status = 'PRINTED'
          and face_ready
          and not has_active_card
          and not replacement_pending
      )::int as eligible_count,
      count(*) filter (
        where production_status <> 'PRINTED'
      )::int as awaiting_print_count,
      count(*) filter (
        where
          not face_ready
      )::int as awaiting_face_count,
      count(*) filter (
        where
          production_status = 'PRINTED'
          and face_ready
          and (
            has_active_card
            or replacement_pending
          )
      )::int as manual_review_count
    from scoped_cards
  `);

  const row = rowsOf<{
    active_count: number;
    total_ready_cards: number;
    eligible_count: number;
    awaiting_print_count: number;
    awaiting_face_count: number;
    manual_review_count: number;
  }>(result)[0];

  return {
    activeCount:
      Number(row?.active_count ?? 0),
    totalReadyCards:
      Number(row?.total_ready_cards ?? 0),
    eligibleCount:
      Number(row?.eligible_count ?? 0),
    awaitingPrintCount:
      Number(row?.awaiting_print_count ?? 0),
    awaitingFaceCount:
      Number(row?.awaiting_face_count ?? 0),
    manualReviewCount:
      Number(row?.manual_review_count ?? 0),
  };
}

export async function activateBranchReadyCardsBulk(
  input: {
    access: SchoolAccess;
    branchId: string;
    stepUpToken: string | null;
    reason: string | null;
  },
) {
  const before =
    await getBranchBulkCardActivationReadiness({
      access: input.access,
      branchId: input.branchId,
    });

  if (before.eligibleCount === 0) {
    throw new BulkCardActivationError(
      "There are no first cards currently eligible for bulk activation in this campus.",
      409,
      "CARD_BULK_ACTIVATION_NONE_ELIGIBLE",
    );
  }

  if (!input.stepUpToken) {
    throw new BulkCardActivationError(
      "Passkey authorization is required for bulk card activation.",
      403,
      "PASSKEY_STEP_UP_REQUIRED",
    );
  }

  const grantId =
    await consumePasskeyStepUpGrantWithId({
      token: input.stepUpToken,
      access: input.access,
      action: "CARD_BULK_ACTIVATE",
    });

  if (!grantId) {
    throw new BulkCardActivationError(
      "Passkey authorization is required for bulk card activation.",
      403,
      "PASSKEY_STEP_UP_REQUIRED",
    );
  }

  const db = getDb();
  const reason =
    input.reason?.trim() ||
    "Campus bulk physical-card handover confirmed";

  const result = await db.execute(sql`
    with scoped_cards as (
      select distinct on (card.id)
        card.id,
        card.school_id,
        card.student_id,
        card.serial_number
      from student_identity_cards card
      join students student
        on student.school_id =
           card.school_id
       and student.id =
           card.student_id
       and student.status =
           'ACTIVE'::student_status
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
        and card.status =
          'READY_FOR_ACTIVATION'::student_identity_card_status
        and (
          select job.status
          from student_card_production_jobs job
          where
            job.school_id =
              card.school_id
            and job.student_id =
              card.student_id
            and job.card_id =
              card.id
          order by
            job.created_at desc
          limit 1
        ) =
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
        and not exists (
          select 1
          from student_identity_cards active_card
          where
            active_card.school_id =
              card.school_id
            and active_card.student_id =
              card.student_id
            and active_card.id <>
              card.id
            and active_card.status =
              'ACTIVE'::student_identity_card_status
        )
        and not exists (
          select 1
          from student_card_replacement_cases replacement
          where
            replacement.school_id =
              card.school_id
            and replacement.student_id =
              card.student_id
            and replacement.status =
              'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
        )
      order by
        card.id,
        enrollment.starts_on desc
    ),
    activated as (
      update student_identity_cards card
      set
        status =
          'ACTIVE'::student_identity_card_status,
        deactivated_at = null,
        updated_at = now()
      from scoped_cards scoped
      where
        card.id = scoped.id
        and card.school_id =
          scoped.school_id
        and card.student_id =
          scoped.student_id
        and card.status =
          'READY_FOR_ACTIVATION'::student_identity_card_status
      returning
        card.id,
        card.school_id,
        card.student_id,
        card.serial_number
    ),
    activation_events as (
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
        activated.school_id,
        activated.student_id,
        activated.id,
        'SCHOOL_MEMBER',
        ${input.access.membership.id}::uuid,
        'ACTIVATED'::student_identity_card_event_type,
        ${reason},
        now()
      from activated
      returning card_id
    )
    select
      count(*)::int as activated_count
    from activation_events
  `);

  const activatedCount = Number(
    rowsOf<{
      activated_count: number;
    }>(result)[0]?.activated_count ?? 0,
  );

  if (activatedCount === 0) {
    throw new BulkCardActivationError(
      "Card readiness changed before the activation batch could be completed. Refresh and review the campus batch.",
      409,
      "CARD_BULK_ACTIVATION_STATE_CHANGED",
    );
  }

  const after =
    await getBranchBulkCardActivationReadiness({
      access: input.access,
      branchId: input.branchId,
    });

  return {
    activatedCount,
    before,
    after,
  };
}
