import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";

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

export async function getStudentBranchTransferSourceScope(
  input: {
    schoolId: string;
    studentId: string;
  },
) {
  const row =
    rowsOf<{
      student_id: string;
      source_branch_id: string;
      source_branch_name: string;
      source_enrollment_id: string;
      academic_session_id: string;
      class_arm_id: string;
      class_name: string;
    }>(
      await getDb().execute(sql`
        select
          student.id::text
            as student_id,
          student.home_branch_id::text
            as source_branch_id,
          branch.name
            as source_branch_name,
          enrollment.id::text
            as source_enrollment_id,
          enrollment.academic_session_id::text
            as academic_session_id,
          enrollment.class_arm_id::text
            as class_arm_id,
          concat_ws(
            ' ',
            level.name,
            arm.name
          ) as class_name
        from students student
        join student_enrollments enrollment
          on enrollment.school_id =
             student.school_id
         and enrollment.student_id =
             student.id
         and enrollment.status =
             'ACTIVE'::student_enrollment_status
        join school_branch_class_arms branch_class
          on branch_class.school_id =
             enrollment.school_id
         and branch_class.class_arm_id =
             enrollment.class_arm_id
        join school_branches branch
          on branch.school_id =
             branch_class.school_id
         and branch.id =
             branch_class.branch_id
         and branch.status =
             'ACTIVE'::school_branch_status
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
        where
          student.school_id =
            ${input.schoolId}::uuid
          and student.id =
            ${input.studentId}::uuid
          and student.status =
            'ACTIVE'::student_status
          and student.home_branch_id =
            branch_class.branch_id
        limit 1
      `),
    )[0];

  return row ?? null;
}

export async function requestStudentBranchTransfer(
  input: {
    access: SchoolAccess;
    studentId: string;
    sourceBranchId: string;
    sourceEnrollmentId: string;
    targetBranchId: string;
    reason: string | null;
  },
) {
  if (
    input.sourceBranchId ===
    input.targetBranchId
  ) {
    throw new SchoolOperationsError(
      "Choose another branch for this transfer.",
      400,
      "TRANSFER_TARGET_MUST_DIFFER",
    );
  }

  try {
    const row =
      rowsOf<{
        id: string;
        status: string;
        target_branch_id: string;
        atomic_integrity_guard: number;
      }>(
        await getDb().execute(sql`
          with source_context as materialized (
            select
              student.id
                as student_id,
              enrollment.id
                as source_enrollment_id
            from students student
            join student_enrollments enrollment
              on enrollment.school_id =
                 student.school_id
             and enrollment.student_id =
                 student.id
             and enrollment.status =
                 'ACTIVE'::student_enrollment_status
            join school_branch_class_arms source_map
              on source_map.school_id =
                 enrollment.school_id
             and source_map.class_arm_id =
                 enrollment.class_arm_id
            where
              student.school_id =
                ${input.access.school.id}::uuid
              and student.id =
                ${input.studentId}::uuid
              and student.status =
                'ACTIVE'::student_status
              and student.home_branch_id =
                ${input.sourceBranchId}::uuid
              and source_map.branch_id =
                ${input.sourceBranchId}::uuid
              and enrollment.id =
                ${input.sourceEnrollmentId}::uuid
            for update
          ),
          valid_target as (
            select branch.id
            from school_branches branch
            where
              branch.school_id =
                ${input.access.school.id}::uuid
              and branch.id =
                ${input.targetBranchId}::uuid
              and branch.status =
                'ACTIVE'::school_branch_status
              and branch.id <>
                ${input.sourceBranchId}::uuid
          ),
          inserted as (
            insert into student_branch_transfer_requests (
              id,
              school_id,
              student_id,
              source_branch_id,
              target_branch_id,
              source_enrollment_id,
              target_class_arm_id,
              status,
              reason,
              requested_by_membership_id,
              decided_by_membership_id,
              requested_at,
              decided_at,
              created_at,
              updated_at
            )
            select
              gen_random_uuid(),
              ${input.access.school.id}::uuid,
              source_context.student_id,
              ${input.sourceBranchId}::uuid,
              valid_target.id,
              source_context.source_enrollment_id,
              null,
              'PENDING'::student_branch_transfer_status,
              ${input.reason},
              ${input.access.membership.id}::uuid,
              null,
              now(),
              null,
              now(),
              now()
            from source_context
            cross join valid_target
            where
              not exists (
                select 1
                from student_branch_transfer_requests pending
                where
                  pending.school_id =
                    ${input.access.school.id}::uuid
                  and pending.student_id =
                    ${input.studentId}::uuid
                  and pending.status =
                    'PENDING'::student_branch_transfer_status
              )
              and not exists (
                select 1
                from attendance_sessions attendance
                join student_attendance_records record
                  on record.school_id =
                     attendance.school_id
                 and record.session_id =
                     attendance.id
                where
                  attendance.school_id =
                    ${input.access.school.id}::uuid
                  and attendance.attendance_date =
                    (
                      now() at time zone
                        ${input.access.school.timezone}
                    )::date
                  and record.student_id =
                    ${input.studentId}::uuid
                  and record.presence_state =
                    'ON_CAMPUS'::attendance_presence_state
              )
            returning
              id,
              student_id,
              target_branch_id,
              status
          ),
          suspended as (
            update students student
            set
              home_branch_id = null,
              updated_at = now()
            from inserted
            where
              student.school_id =
                ${input.access.school.id}::uuid
              and student.id =
                inserted.student_id
              and student.home_branch_id =
                ${input.sourceBranchId}::uuid
            returning student.id
          ),
          integrity as (
            select
              (
                select count(*)::int
                from inserted
              ) as inserted_count,
              (
                select count(*)::int
                from suspended
              ) as suspended_count
          )
          select
            inserted.id::text,
            inserted.status::text,
            inserted.target_branch_id::text,
            1 / integrity.suspended_count
              as atomic_integrity_guard
          from inserted
          cross join integrity
          where
            integrity.inserted_count = 1
            and integrity.suspended_count = 1
        `),
      )[0];

    if (!row) {
      throw new SchoolOperationsError(
        "The transfer could not be requested. Make sure the student is active, signed out, still belongs to this branch, and has no pending transfer.",
        409,
        "TRANSFER_REQUEST_NOT_AVAILABLE",
      );
    }

    return row;
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
        "The transfer state changed while the request was being created. Nothing was committed; reload and try again.",
        409,
        "TRANSFER_REQUEST_STATE_CHANGED",
      );
    }

    throw error;
  }
}

export async function getBranchTransferScope(
  schoolId: string,
  transferId: string,
) {
  return (
    rowsOf<{
      id: string;
      student_id: string;
      source_branch_id: string;
      target_branch_id: string;
      source_enrollment_id: string;
      status:
        | "PENDING"
        | "CONFIRMED"
        | "REJECTED"
        | "CANCELLED";
    }>(
      await getDb().execute(sql`
        select
          id::text,
          student_id::text,
          source_branch_id::text,
          target_branch_id::text,
          source_enrollment_id::text,
          status::text
        from student_branch_transfer_requests
        where
          school_id =
            ${schoolId}::uuid
          and id =
            ${transferId}::uuid
        limit 1
      `),
    )[0] ??
    null
  );
}

export async function listBranchTransferWorkspace(
  input: {
    schoolId: string;
    visibleBranchIds: string[];
  },
) {
  if (
    input.visibleBranchIds.length ===
    0
  ) {
    return {
      branches: [],
      classOptions: [],
      incoming: [],
      outgoing: [],
    };
  }

  const visibleBranchSql =
    sql.join(
      input.visibleBranchIds.map(
        (branchId) =>
          sql`${branchId}::uuid`,
      ),
      sql`, `,
    );

  const [
    transfers,
    branches,
    classOptions,
  ] =
    await Promise.all([
      getDb().execute(sql`
        select
          transfer.id::text,
          transfer.student_id::text,
          transfer.source_branch_id::text,
          source_branch.name
            as source_branch_name,
          transfer.target_branch_id::text,
          target_branch.name
            as target_branch_name,
          transfer.target_class_arm_id::text,
          transfer.status::text,
          transfer.reason,
          transfer.requested_at,
          transfer.decided_at,
          concat_ws(
            ' ',
            student.first_name,
            nullif(
              student.middle_name,
              ''
            ),
            student.last_name
          ) as student_name,
          student.casa_student_id
        from student_branch_transfer_requests transfer
        join students student
          on student.school_id =
             transfer.school_id
         and student.id =
             transfer.student_id
        join school_branches source_branch
          on source_branch.school_id =
             transfer.school_id
         and source_branch.id =
             transfer.source_branch_id
        join school_branches target_branch
          on target_branch.school_id =
             transfer.school_id
         and target_branch.id =
             transfer.target_branch_id
        where
          transfer.school_id =
            ${input.schoolId}::uuid
          and (
            transfer.source_branch_id
              in (${visibleBranchSql})
            or transfer.target_branch_id
              in (${visibleBranchSql})
          )
        order by
          transfer.requested_at desc
        limit 200
      `),
      getDb().execute(sql`
        select
          id::text,
          name,
          code,
          is_headquarters
        from school_branches
        where
          school_id =
            ${input.schoolId}::uuid
          and status =
            'ACTIVE'::school_branch_status
        order by
          is_headquarters desc,
          name asc
      `),
      getDb().execute(sql`
        select
          branch_map.branch_id::text,
          arm.id::text
            as class_arm_id,
          concat_ws(
            ' ',
            level.name,
            arm.name
          ) as class_name
        from school_branch_class_arms
          branch_map
        join class_arms arm
          on arm.school_id =
             branch_map.school_id
         and arm.id =
             branch_map.class_arm_id
         and arm.is_active = true
        join class_levels level
          on level.school_id =
             arm.school_id
         and level.id =
             arm.class_level_id
         and level.is_active = true
        where
          branch_map.school_id =
            ${input.schoolId}::uuid
          and branch_map.branch_id
            in (${visibleBranchSql})
        order by
          level.sort_order asc,
          arm.name asc
      `),
    ]);

  const rows =
    rowsOf<{
      id: string;
      student_id: string;
      source_branch_id: string;
      source_branch_name: string;
      target_branch_id: string;
      target_branch_name: string;
      target_class_arm_id:
        string | null;
      status: string;
      reason: string | null;
      requested_at: string | Date;
      decided_at:
        string | Date | null;
      student_name: string;
      casa_student_id: string;
    }>(
      transfers,
    );

  const visible =
    new Set(
      input.visibleBranchIds,
    );

  return {
    branches:
      rowsOf(branches),
    classOptions:
      rowsOf(classOptions),
    incoming:
      rows.filter(
        (row) =>
          visible.has(
            row.target_branch_id,
          ),
      ),
    outgoing:
      rows.filter(
        (row) =>
          visible.has(
            row.source_branch_id,
          ),
      ),
  };
}

export async function confirmStudentBranchTransfer(
  input: {
    access: SchoolAccess;
    transferId: string;
    targetClassArmId: string;
  },
) {
  try {
    const row =
      rowsOf<{
        id: string;
        student_id: string;
        target_branch_id: string;
        new_enrollment_id: string;
        atomic_integrity_guard: number;
      }>(
        await getDb().execute(sql`
          with target_transfer as materialized (
            select
              transfer.id,
              transfer.student_id,
              transfer.source_branch_id,
              transfer.target_branch_id,
              transfer.source_enrollment_id
            from student_branch_transfer_requests transfer
            join students student
              on student.school_id =
                 transfer.school_id
             and student.id =
                 transfer.student_id
             and student.status =
                 'ACTIVE'::student_status
             and student.home_branch_id
                 is null
            where
              transfer.school_id =
                ${input.access.school.id}::uuid
              and transfer.id =
                ${input.transferId}::uuid
              and transfer.status =
                'PENDING'::student_branch_transfer_status
            for update
          ),
          valid_target_class as (
            select
              branch_map.class_arm_id
            from school_branch_class_arms branch_map
            join class_arms arm
              on arm.school_id =
                 branch_map.school_id
             and arm.id =
                 branch_map.class_arm_id
             and arm.is_active = true
            join class_levels level
              on level.school_id =
                 arm.school_id
             and level.id =
                 arm.class_level_id
             and level.is_active = true
            join target_transfer transfer
              on transfer.target_branch_id =
                 branch_map.branch_id
            where
              branch_map.school_id =
                ${input.access.school.id}::uuid
              and branch_map.class_arm_id =
                ${input.targetClassArmId}::uuid
          ),
          closed as (
            update student_enrollments enrollment
            set
              status =
                'TRANSFERRED'::student_enrollment_status,
              ends_on =
                (
                  now() at time zone
                    ${input.access.school.timezone}
                )::date,
              updated_at = now()
            from target_transfer transfer
            where
              enrollment.school_id =
                ${input.access.school.id}::uuid
              and enrollment.id =
                transfer.source_enrollment_id
              and enrollment.student_id =
                transfer.student_id
              and enrollment.status =
                'ACTIVE'::student_enrollment_status
              and exists (
                select 1
                from valid_target_class
              )
            returning
              enrollment.student_id,
              enrollment.academic_session_id
          ),
          inserted_enrollment as (
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
              ${input.access.school.id}::uuid,
              closed.student_id,
              closed.academic_session_id,
              valid_target_class.class_arm_id,
              'ACTIVE'::student_enrollment_status,
              (
                now() at time zone
                  ${input.access.school.timezone}
              )::date,
              null,
              now(),
              now()
            from closed
            cross join valid_target_class
            returning
              id,
              student_id
          ),
          student_changed as (
            update students student
            set
              home_branch_id =
                transfer.target_branch_id,
              updated_at = now()
            from
              target_transfer transfer,
              inserted_enrollment enrollment
            where
              student.school_id =
                ${input.access.school.id}::uuid
              and student.id =
                enrollment.student_id
              and student.id =
                transfer.student_id
              and student.home_branch_id
                is null
            returning student.id
          ),
          transfer_changed as (
            update student_branch_transfer_requests transfer
            set
              target_class_arm_id =
                ${input.targetClassArmId}::uuid,
              status =
                'CONFIRMED'::student_branch_transfer_status,
              decided_by_membership_id =
                ${input.access.membership.id}::uuid,
              decided_at = now(),
              updated_at = now()
            from
              target_transfer locked,
              inserted_enrollment enrollment,
              student_changed student
            where
              transfer.school_id =
                ${input.access.school.id}::uuid
              and transfer.id =
                locked.id
              and enrollment.student_id =
                locked.student_id
              and student.id =
                locked.student_id
            returning
              transfer.id,
              transfer.student_id,
              transfer.target_branch_id
          ),
          integrity as (
            select
              (
                select count(*)::int
                from target_transfer
              ) as transfer_count,
              (
                select count(*)::int
                from valid_target_class
              ) as target_count,
              (
                select count(*)::int
                from closed
              ) as closed_count,
              (
                select count(*)::int
                from inserted_enrollment
              ) as enrollment_count,
              (
                select count(*)::int
                from student_changed
              ) as student_count,
              (
                select count(*)::int
                from transfer_changed
              ) as changed_count
          )
          select
            transfer_changed.id::text,
            transfer_changed.student_id::text,
            transfer_changed.target_branch_id::text,
            inserted_enrollment.id::text
              as new_enrollment_id,
            1 / integrity.changed_count
              as atomic_integrity_guard
          from transfer_changed
          cross join inserted_enrollment
          cross join integrity
          where
            integrity.transfer_count = 1
            and integrity.target_count = 1
            and integrity.closed_count = 1
            and integrity.enrollment_count = 1
            and integrity.student_count = 1
            and integrity.changed_count = 1
        `),
      )[0];

    if (!row) {
      throw new SchoolOperationsError(
        "The transfer state changed or the destination class is unavailable. Reload and review the transfer again.",
        409,
        "TRANSFER_CONFIRMATION_STATE_CHANGED",
      );
    }

    return row;
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
        "The transfer state changed during confirmation. Nothing was committed; reload and review it again.",
        409,
        "TRANSFER_CONFIRMATION_STATE_CHANGED",
      );
    }

    throw error;
  }
}

async function closeStudentBranchTransfer(
  input: {
    access: SchoolAccess;
    transferId: string;
    nextStatus:
      | "REJECTED"
      | "CANCELLED";
  },
) {
  try {
    const row =
      rowsOf<{
        id: string;
        student_id: string;
        status: string;
        atomic_integrity_guard: number;
      }>(
        await getDb().execute(sql`
          with pending as materialized (
            select
              transfer.id,
              transfer.student_id,
              transfer.source_branch_id
            from student_branch_transfer_requests transfer
            join students student
              on student.school_id =
                 transfer.school_id
             and student.id =
                 transfer.student_id
             and student.home_branch_id
                 is null
            where
              transfer.school_id =
                ${input.access.school.id}::uuid
              and transfer.id =
                ${input.transferId}::uuid
              and transfer.status =
                'PENDING'::student_branch_transfer_status
            for update
          ),
          changed as (
            update student_branch_transfer_requests transfer
            set
              status =
                ${input.nextStatus}::student_branch_transfer_status,
              decided_by_membership_id =
                ${input.access.membership.id}::uuid,
              decided_at = now(),
              updated_at = now()
            from pending
            where
              transfer.school_id =
                ${input.access.school.id}::uuid
              and transfer.id =
                pending.id
            returning
              transfer.id,
              transfer.student_id,
              pending.source_branch_id,
              transfer.status
          ),
          restored as (
            update students student
            set
              home_branch_id =
                changed.source_branch_id,
              updated_at = now()
            from changed
            where
              student.school_id =
                ${input.access.school.id}::uuid
              and student.id =
                changed.student_id
              and student.home_branch_id
                is null
            returning student.id
          ),
          integrity as (
            select
              (
                select count(*)::int
                from changed
              ) as changed_count,
              (
                select count(*)::int
                from restored
              ) as restored_count
          )
          select
            changed.id::text,
            changed.student_id::text,
            changed.status::text,
            1 / integrity.restored_count
              as atomic_integrity_guard
          from changed
          cross join integrity
          where
            integrity.changed_count = 1
            and integrity.restored_count = 1
        `),
      )[0];

    if (!row) {
      throw new SchoolOperationsError(
        "This transfer is no longer pending.",
        409,
        "TRANSFER_NOT_PENDING",
      );
    }

    return row;
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
        "The transfer state changed while it was being closed. Nothing was committed; reload and try again.",
        409,
        "TRANSFER_NOT_PENDING",
      );
    }

    throw error;
  }
}

export async function rejectStudentBranchTransfer(
  input: {
    access: SchoolAccess;
    transferId: string;
  },
) {
  return closeStudentBranchTransfer({
    ...input,
    nextStatus:
      "REJECTED",
  });
}

export async function cancelStudentBranchTransfer(
  input: {
    access: SchoolAccess;
    transferId: string;
  },
) {
  return closeStudentBranchTransfer({
    ...input,
    nextStatus:
      "CANCELLED",
  });
}
