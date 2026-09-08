import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  requireSchoolRole,
  type SchoolAccess,
} from "@/server/auth/authorization";

function rowsOf<T>(
  result: unknown,
): T[] {
  if (
    Array.isArray(
      result,
    )
  ) {
    return result as T[];
  }

  if (
    result &&
    typeof result ===
      "object" &&
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

export class TeacherMyClassError
  extends Error {
  constructor(
    message: string,
    public readonly status:
      number,
    public readonly code:
      string,
  ) {
    super(
      message,
    );

    this.name =
      "TeacherMyClassError";
  }
}

export async function requireTeacherAccess(
  schoolSlug: string,
): Promise<SchoolAccess> {
  // STAFF alone is not sufficient for class data.
  // Every route must additionally resolve an explicit assignment.
  return requireSchoolRole(
    schoolSlug,
    [
      "STAFF",
    ],
  );
}

export async function listTeacherClasses(
  access:
    SchoolAccess,
) {
  const db =
    getDb();

  const result =
    await db.execute(sql`
      select
        assignment.id
          as assignment_id,
        assignment.academic_session_id,
        academic_session.name
          as academic_session_name,
        academic_session.status
          as academic_session_status,
        assignment.class_arm_id,
        arm.name
          as class_arm_name,
        level.id
          as class_level_id,
        level.name
          as class_level_name,
        level.section_id,
        section.name
          as section_name,
        branch_map.branch_id,
        branch.name
          as branch_name,
        count(
          enrollment.id
        ) filter (
          where
            enrollment.status =
              'ACTIVE'::student_enrollment_status
        )::int
          as active_student_count
      from
        school_teacher_class_assignments
          assignment
      join academic_sessions
        academic_session
        on academic_session.school_id =
           assignment.school_id
       and academic_session.id =
           assignment.academic_session_id
      join class_arms arm
        on arm.school_id =
           assignment.school_id
       and arm.id =
           assignment.class_arm_id
      join class_levels level
        on level.school_id =
           arm.school_id
       and level.id =
           arm.class_level_id
      left join school_sections
        section
        on section.school_id =
           level.school_id
       and section.id =
           level.section_id
      join school_branch_class_arms
        branch_map
        on branch_map.school_id =
           assignment.school_id
       and branch_map.class_arm_id =
           assignment.class_arm_id
      join school_branches branch
        on branch.school_id =
           branch_map.school_id
       and branch.id =
           branch_map.branch_id
       and branch.status =
           'ACTIVE'::school_branch_status
      left join student_enrollments
        enrollment
        on enrollment.school_id =
           assignment.school_id
       and enrollment.academic_session_id =
           assignment.academic_session_id
       and enrollment.class_arm_id =
           assignment.class_arm_id
      where
        assignment.school_id =
          ${access.school.id}::uuid
        and assignment.membership_id =
          ${access.membership.id}::uuid
        and assignment.is_active =
          true
        and academic_session.status =
          'ACTIVE'::academic_period_status
        and arm.is_active =
          true
        and level.is_active =
          true
      group by
        assignment.id,
        assignment.academic_session_id,
        academic_session.name,
        academic_session.status,
        academic_session.starts_on,
        assignment.class_arm_id,
        arm.name,
        level.id,
        level.name,
        level.section_id,
        section.name,
        branch_map.branch_id,
        branch.name
      order by
        academic_session.starts_on desc,
        coalesce(
          section.name,
          ''
        ) asc,
        level.name asc,
        arm.name asc
    `);

  return rowsOf(
    result,
  );
}

export async function requireAssignedTeacherClass(
  input: {
    access:
      SchoolAccess;
    classArmId:
      string;
    academicSessionId?:
      string | null;
  },
) {
  const db =
    getDb();

  const result =
    await db.execute(sql`
      select
        assignment.id
          as assignment_id,
        assignment.academic_session_id,
        academic_session.name
          as academic_session_name,
        assignment.class_arm_id,
        arm.name
          as class_arm_name,
        level.id
          as class_level_id,
        level.name
          as class_level_name,
        level.section_id,
        section.name
          as section_name,
        branch_map.branch_id,
        branch.name
          as branch_name
      from
        school_teacher_class_assignments
          assignment
      join academic_sessions
        academic_session
        on academic_session.school_id =
           assignment.school_id
       and academic_session.id =
           assignment.academic_session_id
      join class_arms arm
        on arm.school_id =
           assignment.school_id
       and arm.id =
           assignment.class_arm_id
      join class_levels level
        on level.school_id =
           arm.school_id
       and level.id =
           arm.class_level_id
      left join school_sections
        section
        on section.school_id =
           level.school_id
       and section.id =
           level.section_id
      join school_branch_class_arms
        branch_map
        on branch_map.school_id =
           assignment.school_id
       and branch_map.class_arm_id =
           assignment.class_arm_id
      join school_branches branch
        on branch.school_id =
           branch_map.school_id
       and branch.id =
           branch_map.branch_id
      where
        assignment.school_id =
          ${input.access.school.id}::uuid
        and assignment.membership_id =
          ${input.access.membership.id}::uuid
        and assignment.class_arm_id =
          ${input.classArmId}::uuid
        and assignment.is_active =
          true
        and (
          ${input.academicSessionId ?? null}::uuid
            is null
          or assignment.academic_session_id =
             ${input.academicSessionId ?? null}::uuid
        )
        and (
          ${input.academicSessionId ?? null}::uuid
            is not null
          or academic_session.status =
             'ACTIVE'::academic_period_status
        )
        and arm.is_active =
          true
        and level.is_active =
          true
        and branch.status =
          'ACTIVE'::school_branch_status
      order by
        academic_session.starts_on desc
      limit 1
    `);

  const assignment =
    rowsOf<{
      assignment_id:
        string;
      academic_session_id:
        string;
      academic_session_name:
        string;
      class_arm_id:
        string;
      class_arm_name:
        string;
      class_level_id:
        string;
      class_level_name:
        string;
      section_id:
        string | null;
      section_name:
        string | null;
      branch_id:
        string;
      branch_name:
        string;
    }>(
      result,
    )[0];

  if (
    !assignment
  ) {
    throw new TeacherMyClassError(
      "This class has not been assigned to the current staff member for the requested academic session.",
      403,
      "TEACHER_CLASS_NOT_ASSIGNED",
    );
  }

  return assignment;
}

export async function requireTeacherStudentInClass(
  input: {
    access:
      SchoolAccess;
    classArmId:
      string;
    academicSessionId:
      string;
    studentId:
      string;
  },
) {
  const assignment =
    await requireAssignedTeacherClass({
      access:
        input.access,
      classArmId:
        input.classArmId,
      academicSessionId:
        input.academicSessionId,
    });

  const db =
    getDb();

  const result =
    await db.execute(sql`
      select
        student.id,
        enrollment.id
          as enrollment_id
      from students student
      join student_enrollments
        enrollment
        on enrollment.school_id =
           student.school_id
       and enrollment.student_id =
           student.id
      where
        student.school_id =
          ${input.access.school.id}::uuid
        and student.id =
          ${input.studentId}::uuid
        and student.status =
          'ACTIVE'::student_status
        and enrollment.academic_session_id =
          ${input.academicSessionId}::uuid
        and enrollment.class_arm_id =
          ${input.classArmId}::uuid
        and enrollment.starts_on <=
          (
            select ends_on
            from academic_sessions
            where
              school_id =
                ${input.access.school.id}::uuid
              and id =
                ${input.academicSessionId}::uuid
          )
        and (
          enrollment.ends_on is null
          or enrollment.ends_on >=
             (
               select starts_on
               from academic_sessions
               where
                 school_id =
                   ${input.access.school.id}::uuid
                 and id =
                   ${input.academicSessionId}::uuid
             )
        )
      limit 1
    `);

  if (
    !rowsOf(
      result,
    )[0]
  ) {
    throw new TeacherMyClassError(
      "The requested student is not in this assigned class for the requested academic session.",
      404,
      "TEACHER_STUDENT_NOT_IN_CLASS",
    );
  }

  return assignment;
}

export async function listTeacherClassAssignments(
  access:
    SchoolAccess,
) {
  const db =
    getDb();

  const result =
    await db.execute(sql`
      select
        assignment.id,
        assignment.membership_id,
        teacher.full_name
          as teacher_name,
        teacher.email
          as teacher_email,
        assignment.academic_session_id,
        academic_session.name
          as academic_session_name,
        assignment.class_arm_id,
        level.name
          as class_level_name,
        arm.name
          as class_arm_name,
        branch_map.branch_id,
        branch.name
          as branch_name,
        assignment.is_active,
        assignment.assigned_at,
        assignment.assigned_by_membership_id,
        assignment.revoked_at,
        assignment.revoked_by_membership_id,
        assignment.created_at,
        assignment.updated_at
      from
        school_teacher_class_assignments
          assignment
      join school_memberships
        membership
        on membership.school_id =
           assignment.school_id
       and membership.id =
           assignment.membership_id
      join users teacher
        on teacher.id =
           membership.user_id
      join academic_sessions
        academic_session
        on academic_session.school_id =
           assignment.school_id
       and academic_session.id =
           assignment.academic_session_id
      join class_arms arm
        on arm.school_id =
           assignment.school_id
       and arm.id =
           assignment.class_arm_id
      join class_levels level
        on level.school_id =
           arm.school_id
       and level.id =
           arm.class_level_id
      left join school_branch_class_arms
        branch_map
        on branch_map.school_id =
           assignment.school_id
       and branch_map.class_arm_id =
           assignment.class_arm_id
      left join school_branches branch
        on branch.school_id =
           branch_map.school_id
       and branch.id =
           branch_map.branch_id
      where
        assignment.school_id =
          ${access.school.id}::uuid
      order by
        assignment.is_active desc,
        academic_session.starts_on desc,
        teacher.full_name asc,
        level.name asc,
        arm.name asc
    `);

  return rowsOf(
    result,
  );
}

export async function setTeacherClassAssignment(
  input: {
    access:
      SchoolAccess;
    membershipId:
      string;
    academicSessionId:
      string;
    classArmId:
      string;
    active:
      boolean;
  },
) {
  const db =
    getDb();

  if (
    input.active
  ) {
    const result =
      await db.execute(sql`
        with valid_teacher as (
          select
            membership.id
          from school_memberships
            membership
          join school_membership_roles
            role
            on role.school_id =
               membership.school_id
           and role.membership_id =
               membership.id
           and role.role =
               'STAFF'::school_membership_role
          where
            membership.school_id =
              ${input.access.school.id}::uuid
            and membership.id =
              ${input.membershipId}::uuid
            and membership.status =
              'ACTIVE'::school_membership_status
          limit 1
        ),
        valid_session as (
          select id
          from academic_sessions
          where
            school_id =
              ${input.access.school.id}::uuid
            and id =
              ${input.academicSessionId}::uuid
            and status in (
              'PLANNED'::academic_period_status,
              'ACTIVE'::academic_period_status
            )
          limit 1
        ),
        valid_class as (
          select
            arm.id
          from class_arms arm
          join class_levels level
            on level.school_id =
               arm.school_id
           and level.id =
               arm.class_level_id
          join school_branch_class_arms
            branch_map
            on branch_map.school_id =
               arm.school_id
           and branch_map.class_arm_id =
               arm.id
          join school_branches branch
            on branch.school_id =
               branch_map.school_id
           and branch.id =
               branch_map.branch_id
          where
            arm.school_id =
              ${input.access.school.id}::uuid
            and arm.id =
              ${input.classArmId}::uuid
            and arm.is_active =
              true
            and level.is_active =
              true
            and branch.status =
              'ACTIVE'::school_branch_status
          limit 1
        )
        insert into
          school_teacher_class_assignments (
            id,
            school_id,
            membership_id,
            academic_session_id,
            class_arm_id,
            is_active,
            assigned_at,
            assigned_by_membership_id,
            revoked_at,
            revoked_by_membership_id,
            created_at,
            updated_at
          )
        select
          gen_random_uuid(),
          ${input.access.school.id}::uuid,
          valid_teacher.id,
          valid_session.id,
          valid_class.id,
          true,
          now(),
          ${input.access.membership.id}::uuid,
          null,
          null,
          now(),
          now()
        from
          valid_teacher,
          valid_session,
          valid_class
        on conflict (
          school_id,
          membership_id,
          academic_session_id,
          class_arm_id
        )
        do update set
          is_active =
            true,
          assigned_at =
            now(),
          assigned_by_membership_id =
            ${input.access.membership.id}::uuid,
          revoked_at =
            null,
          revoked_by_membership_id =
            null,
          updated_at =
            now()
        returning
          id,
          membership_id,
          academic_session_id,
          class_arm_id,
          is_active,
          assigned_at
      `);

    const assignment =
      rowsOf(
        result,
      )[0];

    if (
      !assignment
    ) {
      throw new TeacherMyClassError(
        "Assignment requires an ACTIVE STAFF membership, a valid PLANNED/ACTIVE academic session, and an ACTIVE branch-mapped class arm.",
        400,
        "TEACHER_ASSIGNMENT_TARGET_INVALID",
      );
    }

    return assignment;
  }

  const result =
    await db.execute(sql`
      update
        school_teacher_class_assignments
      set
        is_active =
          false,
        revoked_at =
          now(),
        revoked_by_membership_id =
          ${input.access.membership.id}::uuid,
        updated_at =
          now()
      where
        school_id =
          ${input.access.school.id}::uuid
        and membership_id =
          ${input.membershipId}::uuid
        and academic_session_id =
          ${input.academicSessionId}::uuid
        and class_arm_id =
          ${input.classArmId}::uuid
        and is_active =
          true
      returning
        id,
        membership_id,
        academic_session_id,
        class_arm_id,
        is_active,
        revoked_at
    `);

  const assignment =
    rowsOf(
      result,
    )[0];

  if (
    !assignment
  ) {
    throw new TeacherMyClassError(
      "The active teacher/class assignment was not found.",
      404,
      "TEACHER_ASSIGNMENT_NOT_FOUND",
    );
  }

  return assignment;
}
