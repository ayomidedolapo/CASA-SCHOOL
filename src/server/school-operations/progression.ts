import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";
import {
  hasOrganizationAdminAuthority,
} from "./operations";
import {
  SchoolOperationsError,
} from "./errors";

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
      (result as {
        rows?: unknown;
      }).rows,
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

function localDate(
  timezone: string,
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          timezone,
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
      },
    ).formatToParts(
      new Date(),
    );

  const values =
    Object.fromEntries(
      parts.map(
        (part) => [
          part.type,
          part.value,
        ],
      ),
    );

  return `${values.year}-${values.month}-${values.day}`;
}

type ProgressionDecision =
  | "PENDING"
  | "PROMOTED"
  | "RETAINED"
  | "TRANSFERRED"
  | "GRADUATED"
  | "WITHDRAWN";

interface BatchScopeRow {
  id: string;
  branch_id: string;
  status:
    | "DRAFT"
    | "CONFIRMED"
    | "CANCELLED";
  source_session_id: string;
  source_session_name: string;
  source_starts_on: string;
  source_ends_on: string;
  target_session_id: string;
  target_session_name: string;
  target_starts_on: string;
  target_ends_on: string;
}

export async function getProgressionBatchScope(
  schoolId: string,
  batchId: string,
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        b.id,
        b.branch_id,
        b.status,
        b.source_session_id,
        source_session.name
          as source_session_name,
        source_session.starts_on
          as source_starts_on,
        source_session.ends_on
          as source_ends_on,
        b.target_session_id,
        target_session.name
          as target_session_name,
        target_session.starts_on
          as target_starts_on,
        target_session.ends_on
          as target_ends_on
      from student_progression_batches b
      join academic_sessions
        source_session
        on source_session.school_id =
           b.school_id
       and source_session.id =
           b.source_session_id
      join academic_sessions
        target_session
        on target_session.school_id =
           b.school_id
       and target_session.id =
           b.target_session_id
      where
        b.school_id =
          ${schoolId}::uuid
        and b.id =
          ${batchId}::uuid
      limit 1
    `);

  return (
    rowsOf<BatchScopeRow>(
      result,
    )[0] ??
    null
  );
}

export async function createProgressionBatch(
  input: {
    access: SchoolAccess;
    branchId: string;
    sourceSessionId: string;
    targetSessionId: string;
  },
) {
  if (
    input.sourceSessionId ===
    input.targetSessionId
  ) {
    throw new SchoolOperationsError(
      "Source and target academic sessions must be different.",
      400,
      "PROGRESSION_SESSIONS_MUST_DIFFER",
    );
  }

  const db = getDb();

  const sessionsResult =
    await db.execute(sql`
      select
        id,
        name,
        starts_on,
        ends_on,
        status
      from academic_sessions
      where
        school_id =
          ${input.access.school.id}::uuid
        and id in (
          ${input.sourceSessionId}::uuid,
          ${input.targetSessionId}::uuid
        )
    `);

  const sessions =
    rowsOf<{
      id: string;
      name: string;
      starts_on: string;
      ends_on: string;
      status: string;
    }>(
      sessionsResult,
    );

  const source =
    sessions.find(
      (row) =>
        row.id ===
        input.sourceSessionId,
    );

  const target =
    sessions.find(
      (row) =>
        row.id ===
        input.targetSessionId,
    );

  if (!source || !target) {
    throw new SchoolOperationsError(
      "Source or target academic session was not found.",
      404,
      "PROGRESSION_SESSION_NOT_FOUND",
    );
  }

  if (
    source.ends_on >=
    target.starts_on
  ) {
    throw new SchoolOperationsError(
      "The target academic session must start after the source session ends.",
      400,
      "INVALID_PROGRESSION_SESSION_ORDER",
    );
  }

  const result =
    await db.execute(sql`
      with source_students as (
        select
          e.student_id,
          e.id as source_enrollment_id
        from student_enrollments e
        join students s
          on s.school_id =
             e.school_id
         and s.id =
             e.student_id
        join school_branch_class_arms
          branch_class
          on branch_class.school_id =
             e.school_id
         and branch_class.class_arm_id =
             e.class_arm_id
        where
          e.school_id =
            ${input.access.school.id}::uuid
          and e.academic_session_id =
            ${input.sourceSessionId}::uuid
          and e.status =
            'ACTIVE'::student_enrollment_status
          and s.status =
            'ACTIVE'::student_status
          and branch_class.branch_id =
            ${input.branchId}::uuid
      ),
      inserted_batch as (
        insert into student_progression_batches (
          id,
          school_id,
          branch_id,
          source_session_id,
          target_session_id,
          status,
          created_by_membership_id,
          confirmed_by_membership_id,
          confirmed_at,
          created_at,
          updated_at
        )
        values (
          gen_random_uuid(),
          ${input.access.school.id}::uuid,
          ${input.branchId}::uuid,
          ${input.sourceSessionId}::uuid,
          ${input.targetSessionId}::uuid,
          'DRAFT'::student_progression_batch_status,
          ${input.access.membership.id}::uuid,
          null,
          null,
          now(),
          now()
        )
        on conflict (
          school_id,
          branch_id,
          source_session_id,
          target_session_id
        )
        do nothing
        returning
          id,
          status
      ),
      selected_batch as (
        select
          id,
          status,
          true as created
        from inserted_batch
        union all
        select
          existing.id,
          existing.status,
          false as created
        from student_progression_batches
          existing
        where
          existing.school_id =
            ${input.access.school.id}::uuid
          and existing.branch_id =
            ${input.branchId}::uuid
          and existing.source_session_id =
            ${input.sourceSessionId}::uuid
          and existing.target_session_id =
            ${input.targetSessionId}::uuid
          and not exists (
            select 1
            from inserted_batch
          )
        limit 1
      ),
      inserted_decisions as (
        insert into student_progression_decisions (
          id,
          school_id,
          batch_id,
          student_id,
          source_enrollment_id,
          target_class_arm_id,
          decision,
          notes,
          updated_by_membership_id,
          created_at,
          updated_at
        )
        select
          gen_random_uuid(),
          ${input.access.school.id}::uuid,
          selected_batch.id,
          source_students.student_id,
          source_students.source_enrollment_id,
          null,
          'PENDING'::student_progression_decision,
          null,
          null,
          now(),
          now()
        from source_students
        cross join selected_batch
        where
          selected_batch.status =
            'DRAFT'::student_progression_batch_status
        on conflict (
          batch_id,
          student_id
        )
        do nothing
        returning id
      )
      select
        selected_batch.id,
        selected_batch.status,
        selected_batch.created,
        (
          select count(*)::int
          from student_progression_decisions
            decision
          where
            decision.batch_id =
              selected_batch.id
        ) as decision_count,
        (
          select count(*)::int
          from inserted_decisions
        ) as decisions_added
      from selected_batch
    `);

  const row =
    rowsOf<{
      id: string;
      status:
        | "DRAFT"
        | "CONFIRMED"
        | "CANCELLED";
      created: boolean;
      decision_count: number;
      decisions_added: number;
    }>(
      result,
    )[0];

  if (!row) {
    throw new SchoolOperationsError(
      "Unable to create or resolve the progression batch.",
      409,
      "PROGRESSION_BATCH_NOT_RESOLVED",
    );
  }

  return {
    batch: {
      id:
        row.id,
      status:
        row.status,
      sourceSessionId:
        input.sourceSessionId,
      sourceSessionName:
        source.name,
      targetSessionId:
        input.targetSessionId,
      targetSessionName:
        target.name,
      branchId:
        input.branchId,
    },
    created:
      row.created,
    decisionCount:
      Number(
        row.decision_count,
      ),
    decisionsAdded:
      Number(
        row.decisions_added,
      ),
  };
}

export async function listProgressionBatches(
  input: {
    schoolId: string;
    branchId: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        b.id,
        b.branch_id,
        b.status,
        b.source_session_id,
        source_session.name
          as source_session_name,
        source_session.starts_on
          as source_starts_on,
        source_session.ends_on
          as source_ends_on,
        b.target_session_id,
        target_session.name
          as target_session_name,
        target_session.starts_on
          as target_starts_on,
        target_session.ends_on
          as target_ends_on,
        b.created_at,
        b.confirmed_at,
        (
          select count(*)::int
          from student_progression_decisions d
          where d.batch_id = b.id
        ) as student_count,
        (
          select count(*)::int
          from student_progression_decisions d
          where
            d.batch_id = b.id
            and d.decision =
              'PENDING'::student_progression_decision
        ) as pending_count,
        (
          select count(*)::int
          from student_progression_decisions d
          where
            d.batch_id = b.id
            and d.decision =
              'RETAINED'::student_progression_decision
        ) as retained_count
      from student_progression_batches b
      join academic_sessions
        source_session
        on source_session.school_id =
           b.school_id
       and source_session.id =
           b.source_session_id
      join academic_sessions
        target_session
        on target_session.school_id =
           b.school_id
       and target_session.id =
           b.target_session_id
      where
        b.school_id =
          ${input.schoolId}::uuid
        and b.branch_id =
          ${input.branchId}::uuid
      order by
        source_session.starts_on desc,
        b.created_at desc
    `);

  return rowsOf(result);
}

export async function listProgressionDecisions(
  input: {
    access: SchoolAccess;
    batchId: string;
  },
) {
  const db = getDb();

  const decisionResult =
    await db.execute(sql`
      select
        d.id,
        d.student_id,
        s.casa_student_id,
        s.admission_number,
        s.first_name,
        s.middle_name,
        s.last_name,
        d.decision,
        d.target_class_arm_id,
        d.notes,
        source_enrollment.id
          as source_enrollment_id,
        source_arm.id
          as source_class_arm_id,
        source_arm.name
          as source_class_arm_name,
        source_level.id
          as source_class_level_id,
        source_level.name
          as source_class_level_name,
        source_level.sort_order
          as source_class_level_sort_order,
        source_level.section_id
          as source_section_id,
        coalesce(
          source_section.sort_order,
          0
        ) as source_section_sort_order,
        b.branch_id,
        b.status as batch_status
      from student_progression_decisions d
      join student_progression_batches b
        on b.school_id =
           d.school_id
       and b.id =
           d.batch_id
      join students s
        on s.school_id =
           d.school_id
       and s.id =
           d.student_id
      join student_enrollments
        source_enrollment
        on source_enrollment.school_id =
           d.school_id
       and source_enrollment.id =
           d.source_enrollment_id
      join class_arms
        source_arm
        on source_arm.school_id =
           source_enrollment.school_id
       and source_arm.id =
           source_enrollment.class_arm_id
      join class_levels
        source_level
        on source_level.school_id =
           source_arm.school_id
       and source_level.id =
           source_arm.class_level_id
      left join school_sections
        source_section
        on source_section.school_id =
           source_level.school_id
       and source_section.id =
           source_level.section_id
      where
        d.school_id =
          ${input.access.school.id}::uuid
        and d.batch_id =
          ${input.batchId}::uuid
      order by
        coalesce(
          source_section.sort_order,
          0
        ) asc,
        source_level.sort_order asc,
        source_arm.name asc,
        s.last_name asc,
        s.first_name asc
    `);

  const optionResult =
    await db.execute(sql`
      select
        branch_map.branch_id,
        arm.id as class_arm_id,
        arm.name as class_arm_name,
        level.id as class_level_id,
        level.name as class_level_name,
        level.sort_order
          as class_level_sort_order,
        level.section_id,
        coalesce(
          section.sort_order,
          0
        ) as section_sort_order,
        section.name
          as section_name
      from school_branch_class_arms
        branch_map
      join class_arms arm
        on arm.school_id =
           branch_map.school_id
       and arm.id =
           branch_map.class_arm_id
      join class_levels level
        on level.school_id =
           arm.school_id
       and level.id =
           arm.class_level_id
      left join school_sections section
        on section.school_id =
           level.school_id
       and section.id =
           level.section_id
      where
        branch_map.school_id =
          ${input.access.school.id}::uuid
        and arm.is_active = true
        and level.is_active = true
      order by
        coalesce(
          section.sort_order,
          0
        ) asc,
        level.sort_order asc,
        arm.name asc
    `);

  const decisions =
    rowsOf<{
      id: string;
      student_id: string;
      casa_student_id: string;
      admission_number:
        string | null;
      first_name: string;
      middle_name:
        string | null;
      last_name: string;
      decision:
        ProgressionDecision;
      target_class_arm_id:
        string | null;
      notes:
        string | null;
      source_enrollment_id:
        string;
      source_class_arm_id:
        string;
      source_class_arm_name:
        string;
      source_class_level_id:
        string;
      source_class_level_name:
        string;
      source_class_level_sort_order:
        number;
      source_section_id:
        string | null;
      source_section_sort_order:
        number;
      branch_id:
        string;
      batch_status:
        | "DRAFT"
        | "CONFIRMED"
        | "CANCELLED";
    }>(
      decisionResult,
    );

  const options =
    rowsOf<{
      branch_id: string;
      class_arm_id: string;
      class_arm_name: string;
      class_level_id: string;
      class_level_name: string;
      class_level_sort_order:
        number;
      section_id:
        string | null;
      section_sort_order:
        number;
      section_name:
        string | null;
    }>(
      optionResult,
    );

  return decisions.map(
    (decision) => {
      const sameBranchForward =
        options.filter(
          (option) =>
            option.branch_id ===
              decision.branch_id &&
            (
              option.section_sort_order >
                decision.source_section_sort_order ||
              (
                option.section_sort_order ===
                  decision.source_section_sort_order &&
                option.class_level_sort_order >
                  decision.source_class_level_sort_order
              )
            ),
        );

      if (
        sameBranchForward.length ===
        0
      ) {
        return {
          ...decision,
          suggestedTargetClassArmId:
            null,
        };
      }

      const first =
        sameBranchForward[0];

      const firstLevelOptions =
        sameBranchForward.filter(
          (option) =>
            option.section_sort_order ===
              first.section_sort_order &&
            option.class_level_sort_order ===
              first.class_level_sort_order,
        );

      return {
        ...decision,
        suggestedTargetClassArmId:
          firstLevelOptions.length ===
          1
            ? first.class_arm_id
            : null,
      };
    },
  );
}

export async function updateProgressionDecision(
  input: {
    access: SchoolAccess;
    batchId: string;
    decisionId: string;
    decision:
      ProgressionDecision;
    targetClassArmId:
      string | null;
    notes: string | null;
  },
) {
  const db = getDb();

  const currentResult =
    await db.execute(sql`
      select
        d.id,
        b.status as batch_status,
        b.branch_id
          as source_branch_id,
        source_arm.id
          as source_class_arm_id,
        source_level.id
          as source_class_level_id,
        source_level.sort_order
          as source_class_level_sort_order,
        coalesce(
          source_section.sort_order,
          0
        ) as source_section_sort_order
      from student_progression_decisions d
      join student_progression_batches b
        on b.school_id =
           d.school_id
       and b.id =
           d.batch_id
      join student_enrollments
        source_enrollment
        on source_enrollment.school_id =
           d.school_id
       and source_enrollment.id =
           d.source_enrollment_id
      join class_arms source_arm
        on source_arm.school_id =
           source_enrollment.school_id
       and source_arm.id =
           source_enrollment.class_arm_id
      join class_levels source_level
        on source_level.school_id =
           source_arm.school_id
       and source_level.id =
           source_arm.class_level_id
      left join school_sections
        source_section
        on source_section.school_id =
           source_level.school_id
       and source_section.id =
           source_level.section_id
      where
        d.school_id =
          ${input.access.school.id}::uuid
        and d.batch_id =
          ${input.batchId}::uuid
        and d.id =
          ${input.decisionId}::uuid
      limit 1
    `);

  const current =
    rowsOf<{
      id: string;
      batch_status:
        | "DRAFT"
        | "CONFIRMED"
        | "CANCELLED";
      source_branch_id: string;
      source_class_arm_id: string;
      source_class_level_id: string;
      source_class_level_sort_order:
        number;
      source_section_sort_order:
        number;
    }>(
      currentResult,
    )[0];

  if (!current) {
    throw new SchoolOperationsError(
      "Progression decision not found.",
      404,
      "PROGRESSION_DECISION_NOT_FOUND",
    );
  }

  if (
    current.batch_status !==
    "DRAFT"
  ) {
    throw new SchoolOperationsError(
      "Only draft progression batches can be edited.",
      409,
      "PROGRESSION_BATCH_LOCKED",
    );
  }

  const targetRequired =
    input.decision ===
      "PROMOTED" ||
    input.decision ===
      "RETAINED" ||
    input.decision ===
      "TRANSFERRED";

  if (
    targetRequired &&
    !input.targetClassArmId
  ) {
    throw new SchoolOperationsError(
      "This progression decision requires a target class.",
      400,
      "PROGRESSION_TARGET_REQUIRED",
    );
  }

  if (
    !targetRequired &&
    input.targetClassArmId
  ) {
    throw new SchoolOperationsError(
      "This progression decision must not contain a target class.",
      400,
      "PROGRESSION_TARGET_NOT_ALLOWED",
    );
  }

  if (
    input.targetClassArmId
  ) {
    const targetResult =
      await db.execute(sql`
        select
          branch_map.branch_id,
          arm.id as class_arm_id,
          level.id as class_level_id,
          level.sort_order
            as class_level_sort_order,
          coalesce(
            section.sort_order,
            0
          ) as section_sort_order
        from school_branch_class_arms
          branch_map
        join school_branches branch
          on branch.school_id =
             branch_map.school_id
         and branch.id =
             branch_map.branch_id
        join class_arms arm
          on arm.school_id =
             branch_map.school_id
         and arm.id =
             branch_map.class_arm_id
        join class_levels level
          on level.school_id =
             arm.school_id
         and level.id =
             arm.class_level_id
        left join school_sections section
          on section.school_id =
             level.school_id
         and section.id =
             level.section_id
        where
          branch_map.school_id =
            ${input.access.school.id}::uuid
          and arm.id =
            ${input.targetClassArmId}::uuid
          and branch.status =
            'ACTIVE'::school_branch_status
          and arm.is_active = true
          and level.is_active = true
        limit 1
      `);

    const target =
      rowsOf<{
        branch_id: string;
        class_arm_id: string;
        class_level_id: string;
        class_level_sort_order:
          number;
        section_sort_order:
          number;
      }>(
        targetResult,
      )[0];

    if (!target) {
      throw new SchoolOperationsError(
        "The target class is not active and branch-scoped.",
        400,
        "INVALID_PROGRESSION_TARGET",
      );
    }

    const crossBranch =
      target.branch_id !==
      current.source_branch_id;

    if (
      input.decision ===
      "TRANSFERRED"
    ) {
      if (!crossBranch) {
        throw new SchoolOperationsError(
          "TRANSFERRED is reserved for a move to another branch.",
          400,
          "TRANSFER_REQUIRES_BRANCH_CHANGE",
        );
      }

      if (
        !hasOrganizationAdminAuthority(
          input.access,
        )
      ) {
        throw new SchoolOperationsError(
          "Cross-branch transfers require organization OWNER or ADMIN authority.",
          403,
          "CROSS_BRANCH_TRANSFER_REQUIRES_HQ",
        );
      }
    } else if (crossBranch) {
      throw new SchoolOperationsError(
        "A cross-branch move must use TRANSFERRED.",
        400,
        "CROSS_BRANCH_REQUIRES_TRANSFER",
      );
    }

    if (
      input.decision ===
        "RETAINED" &&
      target.class_level_id !==
        current.source_class_level_id
    ) {
      throw new SchoolOperationsError(
        "A retained student must remain at the same class level.",
        400,
        "INVALID_RETENTION_TARGET",
      );
    }

    if (
      input.decision ===
      "PROMOTED"
    ) {
      const movesForward =
        target.section_sort_order >
          current.source_section_sort_order ||
        (
          target.section_sort_order ===
            current.source_section_sort_order &&
          target.class_level_sort_order >
            current.source_class_level_sort_order
        );

      if (!movesForward) {
        throw new SchoolOperationsError(
          "A promoted student must move forward to a later academic level.",
          400,
          "INVALID_PROMOTION_TARGET",
        );
      }
    }
  }

  const result =
    await db.execute(sql`
      update student_progression_decisions
      set
        decision =
          ${input.decision}::student_progression_decision,
        target_class_arm_id =
          ${input.targetClassArmId}::uuid,
        notes =
          ${input.notes},
        updated_by_membership_id =
          ${input.access.membership.id}::uuid,
        updated_at =
          now()
      where
        school_id =
          ${input.access.school.id}::uuid
        and batch_id =
          ${input.batchId}::uuid
        and id =
          ${input.decisionId}::uuid
      returning
        id,
        student_id,
        decision,
        target_class_arm_id,
        notes,
        updated_at
    `);

  return (
    rowsOf(
      result,
    )[0] ??
    null
  );
}

export async function cancelProgressionBatch(
  input: {
    access: SchoolAccess;
    batchId: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      update student_progression_batches
      set
        status =
          'CANCELLED'::student_progression_batch_status,
        updated_at =
          now()
      where
        school_id =
          ${input.access.school.id}::uuid
        and id =
          ${input.batchId}::uuid
        and status =
          'DRAFT'::student_progression_batch_status
      returning
        id,
        status,
        updated_at
    `);

  const row =
    rowsOf(
      result,
    )[0];

  if (!row) {
    throw new SchoolOperationsError(
      "Only a draft progression batch can be cancelled.",
      409,
      "PROGRESSION_BATCH_NOT_CANCELLABLE",
    );
  }

  return row;
}

export async function confirmProgressionBatch(
  input: {
    access: SchoolAccess;
    batchId: string;
  },
) {
  const batch =
    await getProgressionBatchScope(
      input.access.school.id,
      input.batchId,
    );

  if (!batch) {
    throw new SchoolOperationsError(
      "Progression batch not found.",
      404,
      "PROGRESSION_BATCH_NOT_FOUND",
    );
  }

  if (
    batch.status !==
    "DRAFT"
  ) {
    throw new SchoolOperationsError(
      "Only a draft progression batch can be confirmed.",
      409,
      "PROGRESSION_BATCH_LOCKED",
    );
  }

  if (
    batch.source_ends_on >=
    localDate(
      input.access.school.timezone,
    )
  ) {
    throw new SchoolOperationsError(
      "Progression can only be confirmed after the source academic session has ended.",
      409,
      "SOURCE_SESSION_NOT_ENDED",
    );
  }

  const db = getDb();

  const reviewResult =
    await db.execute(sql`
      select
        count(*)::int
          as decision_count,
        count(*) filter (
          where decision =
            'PENDING'::student_progression_decision
        )::int as pending_count,
        count(*) filter (
          where decision in (
            'PROMOTED'::student_progression_decision,
            'RETAINED'::student_progression_decision,
            'TRANSFERRED'::student_progression_decision
          )
        )::int as continuing_count,
        count(*) filter (
          where decision in (
            'GRADUATED'::student_progression_decision,
            'WITHDRAWN'::student_progression_decision
          )
        )::int as terminal_count,
        count(*) filter (
          where decision =
            'TRANSFERRED'::student_progression_decision
        )::int as transfer_count
      from student_progression_decisions
      where
        school_id =
          ${input.access.school.id}::uuid
        and batch_id =
          ${input.batchId}::uuid
    `);

  const review =
    rowsOf<{
      decision_count: number;
      pending_count: number;
      continuing_count: number;
      terminal_count: number;
      transfer_count: number;
    }>(
      reviewResult,
    )[0];

  if (
    !review ||
    Number(
      review.decision_count,
    ) === 0
  ) {
    throw new SchoolOperationsError(
      "This progression batch has no students to confirm.",
      409,
      "PROGRESSION_BATCH_EMPTY",
    );
  }

  if (
    Number(
      review.pending_count,
    ) !== 0
  ) {
    throw new SchoolOperationsError(
      "Every student must be reviewed before progression is confirmed.",
      409,
      "PROGRESSION_REVIEW_INCOMPLETE",
    );
  }

  if (
    Number(
      review.transfer_count,
    ) > 0 &&
    !hasOrganizationAdminAuthority(
      input.access,
    )
  ) {
    throw new SchoolOperationsError(
      "A batch containing cross-branch transfers requires organization OWNER or ADMIN confirmation.",
      403,
      "TRANSFER_CONFIRMATION_REQUIRES_HQ",
    );
  }

  const now =
    new Date();

  try {
    const result =
      await db.execute(sql`
        with target_batch as (
          select
            b.id,
            b.school_id,
            b.branch_id,
            b.source_session_id,
            b.target_session_id,
            source_session.ends_on
              as source_ends_on,
            target_session.starts_on
              as target_starts_on
          from student_progression_batches b
          join academic_sessions
            source_session
            on source_session.school_id =
               b.school_id
           and source_session.id =
               b.source_session_id
          join academic_sessions
            target_session
            on target_session.school_id =
               b.school_id
           and target_session.id =
               b.target_session_id
          where
            b.school_id =
              ${input.access.school.id}::uuid
            and b.id =
              ${input.batchId}::uuid
            and b.status =
              'DRAFT'::student_progression_batch_status
        ),
        reviewed as (
          select
            d.*,
            source_enrollment.class_arm_id
              as source_class_arm_id
          from student_progression_decisions d
          join target_batch b
            on b.school_id =
               d.school_id
           and b.id =
               d.batch_id
          join student_enrollments
            source_enrollment
            on source_enrollment.school_id =
               d.school_id
           and source_enrollment.id =
               d.source_enrollment_id
          join school_branch_class_arms
            source_branch
            on source_branch.school_id =
               source_enrollment.school_id
           and source_branch.class_arm_id =
               source_enrollment.class_arm_id
           and source_branch.branch_id =
               b.branch_id
          where
            d.decision <>
              'PENDING'::student_progression_decision
            and source_enrollment.academic_session_id =
              b.source_session_id
            and source_enrollment.status =
              'ACTIVE'::student_enrollment_status
        ),
        expected as (
          select
            (
              select count(*)::int
              from student_progression_decisions d
              join target_batch b
                on b.school_id =
                   d.school_id
               and b.id =
                   d.batch_id
            ) as total_decisions,
            (
              select count(*)::int
              from reviewed
            ) as valid_reviewed
        ),
        closed as (
          update student_enrollments e
          set
            status =
              case
                when reviewed.decision =
                  'TRANSFERRED'::student_progression_decision
                  then
                    'TRANSFERRED'::student_enrollment_status
                when reviewed.decision =
                  'WITHDRAWN'::student_progression_decision
                  then
                    'WITHDRAWN'::student_enrollment_status
                else
                    'COMPLETED'::student_enrollment_status
              end,
            ends_on =
              target_batch.source_ends_on,
            updated_at =
              ${now}::timestamptz
          from reviewed,
               target_batch,
               expected
          where
            expected.total_decisions =
              expected.valid_reviewed
            and e.school_id =
              reviewed.school_id
            and e.id =
              reviewed.source_enrollment_id
            and e.status =
              'ACTIVE'::student_enrollment_status
          returning
            e.id,
            e.school_id,
            e.student_id
        ),
        inserted_enrollments as (
          insert into student_enrollments (
            id,
            school_id,
            student_id,
            academic_session_id,
            class_arm_id,
            status,
            starts_on,
            ends_on,
            created_at,
            updated_at
          )
          select
            gen_random_uuid(),
            reviewed.school_id,
            reviewed.student_id,
            target_batch.target_session_id,
            reviewed.target_class_arm_id,
            'ACTIVE'::student_enrollment_status,
            target_batch.target_starts_on,
            null,
            ${now}::timestamptz,
            ${now}::timestamptz
          from reviewed
          join closed
            on closed.school_id =
               reviewed.school_id
           and closed.student_id =
               reviewed.student_id
          cross join target_batch
          where
            reviewed.decision in (
              'PROMOTED'::student_progression_decision,
              'RETAINED'::student_progression_decision,
              'TRANSFERRED'::student_progression_decision
            )
            and reviewed.target_class_arm_id
              is not null
          returning
            id,
            school_id,
            student_id,
            class_arm_id
        ),
        terminal_students as (
          update students s
          set
            status =
              case
                when reviewed.decision =
                  'GRADUATED'::student_progression_decision
                  then
                    'GRADUATED'::student_status
                else
                    'WITHDRAWN'::student_status
              end,
            exit_date =
              target_batch.source_ends_on,
            updated_at =
              ${now}::timestamptz
          from reviewed,
               target_batch,
               closed
          where
            closed.school_id =
              reviewed.school_id
            and closed.student_id =
              reviewed.student_id
            and s.school_id =
              reviewed.school_id
            and s.id =
              reviewed.student_id
            and reviewed.decision in (
              'GRADUATED'::student_progression_decision,
              'WITHDRAWN'::student_progression_decision
            )
          returning
            s.id
        ),
        renewal_batch as (
          insert into student_card_renewal_batches (
            id,
            school_id,
            target_session_id,
            status,
            created_at,
            updated_at
          )
          select
            gen_random_uuid(),
            target_batch.school_id,
            target_batch.target_session_id,
            'PLANNED'::student_card_renewal_batch_status,
            ${now}::timestamptz,
            ${now}::timestamptz
          from target_batch
          where exists (
            select 1
            from inserted_enrollments
          )
          on conflict (
            school_id,
            target_session_id
          )
          do update set
            updated_at =
              excluded.updated_at
          returning
            id,
            school_id,
            target_session_id
        ),
        renewal_items as (
          insert into student_card_renewal_batch_items (
            id,
            school_id,
            batch_id,
            student_id,
            target_enrollment_id,
            branch_id,
            section_id,
            production_job_id,
            reason,
            created_at,
            updated_at
          )
          select
            gen_random_uuid(),
            next_enrollment.school_id,
            renewal_batch.id,
            next_enrollment.student_id,
            next_enrollment.id,
            target_branch.branch_id,
            target_level.section_id,
            null,
            case
              when
                reviewed.source_class_arm_id =
                next_enrollment.class_arm_id
                then
                  'SESSION_CHANGE'::student_card_renewal_reason
              else
                  'CLASS_AND_SESSION_CHANGE'::student_card_renewal_reason
            end,
            ${now}::timestamptz,
            ${now}::timestamptz
          from inserted_enrollments
            next_enrollment
          join reviewed
            on reviewed.school_id =
               next_enrollment.school_id
           and reviewed.student_id =
               next_enrollment.student_id
          join renewal_batch
            on renewal_batch.school_id =
               next_enrollment.school_id
          join school_branch_class_arms
            target_branch
            on target_branch.school_id =
               next_enrollment.school_id
           and target_branch.class_arm_id =
               next_enrollment.class_arm_id
          join class_arms target_arm
            on target_arm.school_id =
               next_enrollment.school_id
           and target_arm.id =
               next_enrollment.class_arm_id
          join class_levels target_level
            on target_level.school_id =
               target_arm.school_id
           and target_level.id =
               target_arm.class_level_id
          on conflict (
            batch_id,
            student_id
          )
          do nothing
          returning id
        ),
        integrity as (
          select
            expected.total_decisions,
            expected.valid_reviewed,
            (
              select count(*)::int
              from closed
            ) as closed_count,
            (
              select count(*)::int
              from inserted_enrollments
            ) as next_enrollment_count,
            (
              select count(*)::int
              from terminal_students
            ) as terminal_student_count,
            (
              select count(*)::int
              from renewal_items
            ) as renewal_item_count,
            (
              select count(*)::int
              from reviewed
              where decision in (
                'PROMOTED'::student_progression_decision,
                'RETAINED'::student_progression_decision,
                'TRANSFERRED'::student_progression_decision
              )
            ) as expected_continuing,
            (
              select count(*)::int
              from reviewed
              where decision in (
                'GRADUATED'::student_progression_decision,
                'WITHDRAWN'::student_progression_decision
              )
            ) as expected_terminal
          from expected
        ),
        confirmed as (
          update student_progression_batches b
          set
            status =
              'CONFIRMED'::student_progression_batch_status,
            confirmed_by_membership_id =
              ${input.access.membership.id}::uuid,
            confirmed_at =
              ${now}::timestamptz,
            updated_at =
              ${now}::timestamptz
          from integrity
          where
            b.school_id =
              ${input.access.school.id}::uuid
            and b.id =
              ${input.batchId}::uuid
            and b.status =
              'DRAFT'::student_progression_batch_status
            and integrity.total_decisions =
              integrity.valid_reviewed
            and integrity.closed_count =
              integrity.total_decisions
            and integrity.next_enrollment_count =
              integrity.expected_continuing
            and integrity.terminal_student_count =
              integrity.expected_terminal
            and integrity.renewal_item_count =
              integrity.expected_continuing
          returning b.id
        )
        select
          integrity.*,
          (
            select count(*)::int
            from confirmed
          ) as confirmed_count,
          1 / (
            select count(*)::int
            from confirmed
          ) as atomic_integrity_guard
        from integrity
      `);

    const row =
      rowsOf<{
        total_decisions: number;
        valid_reviewed: number;
        closed_count: number;
        next_enrollment_count: number;
        terminal_student_count: number;
        renewal_item_count: number;
        expected_continuing: number;
        expected_terminal: number;
        confirmed_count: number;
        atomic_integrity_guard:
          number;
      }>(
        result,
      )[0];

    if (
      !row ||
      Number(
        row.confirmed_count,
      ) !== 1
    ) {
      throw new SchoolOperationsError(
        "Progression confirmation did not commit atomically.",
        409,
        "PROGRESSION_CONFIRMATION_RACE",
      );
    }

    return {
      batchId:
        input.batchId,
      confirmed:
        true,
      students:
        Number(
          row.total_decisions,
        ),
      continuingStudents:
        Number(
          row.next_enrollment_count,
        ),
      terminalStudents:
        Number(
          row.terminal_student_count,
        ),
      renewalItems:
        Number(
          row.renewal_item_count,
        ),
    };
  } catch (error) {
    if (
      (
        error as {
          code?: string;
        }
      )?.code ===
      "22012"
    ) {
      throw new SchoolOperationsError(
        "Progression state changed during confirmation. Nothing was committed; reload and review again.",
        409,
        "PROGRESSION_CONFIRMATION_RACE",
      );
    }

    throw error;
  }
}
