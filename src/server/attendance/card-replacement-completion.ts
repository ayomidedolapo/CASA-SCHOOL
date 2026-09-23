import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";

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

export class CardReplacementCompletionError
  extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name =
      "CardReplacementCompletionError";
  }
}

export async function completeStudentCardReplacement(
  input: {
    access: SchoolAccess;
    studentId: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      with pending_case as (
        select
          replacement.id,
          replacement.lost_card_id,
          replacement.replacement_requested_at,
          replacement.payment_status
        from student_card_replacement_cases replacement
        where
          replacement.school_id =
            ${input.access.school.id}::uuid
          and replacement.student_id =
            ${input.studentId}::uuid
          and replacement.status =
            'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
        for update
      ),
      active_card as (
        select
          card.id
        from student_identity_cards card
        join pending_case replacement
          on replacement.lost_card_id <>
             card.id
        where
          card.school_id =
            ${input.access.school.id}::uuid
          and card.student_id =
            ${input.studentId}::uuid
          and card.status =
            'ACTIVE'::student_identity_card_status
      ),
      eligible as (
        select
          replacement.id
            as case_id,
          card.id
            as card_id
        from pending_case replacement
        join active_card card
          on true
        where
          replacement.replacement_requested_at
            is not null
          and replacement.payment_status =
            'PAID'::student_card_replacement_payment_status
          and (
            select count(*)
            from active_card
          ) = 1
          and exists (
            select 1
            from student_card_production_jobs job
            where
              job.school_id =
                ${input.access.school.id}::uuid
              and job.student_id =
                ${input.studentId}::uuid
              and job.card_id =
                card.id
              and job.status =
                'PRINTED'::student_card_production_status
          )
      ),
      completed as (
        update student_card_replacement_cases replacement
        set
          status =
            'COMPLETED'::student_card_replacement_case_status,
          replacement_card_id =
            eligible.card_id,
          completed_at = now(),
          completed_by_membership_id =
            ${input.access.membership.id}::uuid,
          updated_at = now()
        from eligible
        where
          replacement.school_id =
            ${input.access.school.id}::uuid
          and replacement.id =
            eligible.case_id
          and replacement.status =
            'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
        returning
          replacement.id,
          replacement.student_id,
          replacement.lost_card_id,
          replacement.replacement_card_id,
          replacement.status::text
            as status,
          replacement.completed_at,
          replacement.completed_by_membership_id
      )
      select *
      from completed
    `);

  const completed =
    rowsOf(result)[0];

  if (completed) {
    return completed;
  }

  const state =
    await db.execute(sql`
      select
        replacement.id,
        replacement.status::text
          as status,
        replacement.replacement_requested_at,
        replacement.payment_status::text
          as payment_status,
        replacement.replacement_card_id,
        (
          select count(*)::int
          from student_identity_cards card
          where
            card.school_id =
              replacement.school_id
            and card.student_id =
              replacement.student_id
            and card.status =
              'ACTIVE'::student_identity_card_status
            and card.id <>
              replacement.lost_card_id
        ) as active_replacement_cards,
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
              replacement.school_id
            and job.student_id =
              replacement.student_id
            and card.status =
              'ACTIVE'::student_identity_card_status
            and card.id <>
              replacement.lost_card_id
            and job.status =
              'PRINTED'::student_card_production_status
        ) as printed_jobs
      from student_card_replacement_cases replacement
      where
        replacement.school_id =
          ${input.access.school.id}::uuid
        and replacement.student_id =
          ${input.studentId}::uuid
      order by
        replacement.created_at desc
      limit 1
    `);

  const row =
    rowsOf<{
      id: string;
      status: string;
      replacement_requested_at:
        string | Date | null;
      payment_status:
        string;
      replacement_card_id:
        string | null;
      active_replacement_cards:
        number;
      printed_jobs:
        number;
    }>(
      state,
    )[0];

  if (!row) {
    throw new CardReplacementCompletionError(
      "No card replacement case exists for this student.",
      404,
      "CARD_REPLACEMENT_CASE_NOT_FOUND",
    );
  }

  if (
    row.status ===
      "COMPLETED" &&
    row.replacement_card_id
  ) {
    return row;
  }

  if (
    row.status !==
    "CARD_REPLACEMENT_PENDING"
  ) {
    throw new CardReplacementCompletionError(
      "The card replacement case is not pending.",
      409,
      "CARD_REPLACEMENT_NOT_PENDING",
    );
  }

  if (
    !row.replacement_requested_at
  ) {
    throw new CardReplacementCompletionError(
      "A formal replacement request is required before handover can be completed.",
      409,
      "CARD_REPLACEMENT_REQUEST_REQUIRED",
    );
  }

  if (
    row.payment_status !==
      "PAID"
  ) {
    throw new CardReplacementCompletionError(
      "The replacement fee must be marked paid before handover can be completed.",
      409,
      "CARD_REPLACEMENT_PAYMENT_REQUIRED",
    );
  }

  if (
    Number(
      row.active_replacement_cards,
    ) !== 1
  ) {
    throw new CardReplacementCompletionError(
      "Exactly one authoritative ACTIVE replacement card is required.",
      409,
      "ACTIVE_REPLACEMENT_CARD_REQUIRED",
    );
  }

  if (
    Number(
      row.printed_jobs,
    ) < 1
  ) {
    throw new CardReplacementCompletionError(
      "The replacement card must be marked PRINTED by the central production workflow before handover completion.",
      409,
      "REPLACEMENT_CARD_NOT_PRINTED",
    );
  }

  throw new CardReplacementCompletionError(
    "The replacement case changed before completion.",
    409,
    "CARD_REPLACEMENT_STATE_CHANGED",
  );
}
