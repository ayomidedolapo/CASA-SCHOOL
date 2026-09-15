import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  requireSchoolAccess,
  requireSchoolRole,
  SchoolAccessDeniedError,
  type SchoolAccess,
} from "@/server/auth/authorization";
import { SchoolOperationsError } from "./errors";

function rowsOf<T>(result: unknown): T[] {
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

export function hasOrganizationAdminAuthority(
  access: SchoolAccess,
) {
  return access.roles.some(
    (role) =>
      role === "OWNER" ||
      role === "ADMIN",
  );
}

export async function requireOrganizationAdmin(
  schoolSlug: string,
) {
  return requireSchoolRole(
    schoolSlug,
    ["OWNER", "ADMIN"],
  );
}

export async function requireBranchAccess(
  schoolSlug: string,
  branchId: string,
) {
  const access =
    await requireSchoolAccess(schoolSlug);
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        b.id,
        b.name,
        b.code,
        b.address,
        b.is_headquarters,
        b.status
      from school_branches b
      where
        b.school_id =
          ${access.school.id}::uuid
        and b.id =
          ${branchId}::uuid
      limit 1
    `);

  const branch =
    rowsOf<{
      id: string;
      name: string;
      code: string;
      address: string | null;
      is_headquarters: boolean;
      status: "ACTIVE" | "INACTIVE";
    }>(result)[0];

  if (
    !branch ||
    branch.status !== "ACTIVE"
  ) {
    throw new SchoolOperationsError(
      "Branch not found or inactive.",
      404,
      "BRANCH_NOT_FOUND",
    );
  }

  if (
    hasOrganizationAdminAuthority(access)
  ) {
    return {
      access,
      branch,
      organizationAdmin: true,
    };
  }

  const assignment =
    await db.execute(sql`
      select id
      from school_branch_admin_assignments
      where
        school_id =
          ${access.school.id}::uuid
        and branch_id =
          ${branchId}::uuid
        and membership_id =
          ${access.membership.id}::uuid
        and is_active = true
      limit 1
    `);

  if (
    rowsOf<{ id: string }>(
      assignment,
    ).length === 0
  ) {
    throw new SchoolAccessDeniedError();
  }

  return {
    access,
    branch,
    organizationAdmin: false,
  };
}

export async function listVisibleBranches(
  schoolSlug: string,
) {
  const access =
    await requireSchoolAccess(schoolSlug);
  const db = getDb();

  if (
    hasOrganizationAdminAuthority(access)
  ) {
    const result =
      await db.execute(sql`
        select
          id,
          name,
          code,
          address,
          is_headquarters,
          status,
          created_at,
          updated_at
        from school_branches
        where school_id =
          ${access.school.id}::uuid
        order by
          is_headquarters desc,
          name asc
      `);

    return {
      access,
      organizationAdmin: true,
      branches: rowsOf(result),
    };
  }

  if (
    access.roles.includes(
      "SCHOOL_TECHNICIAN",
    )
  ) {
    const result =
      await db.execute(sql`
        select
          id,
          name,
          code,
          address,
          is_headquarters,
          status,
          created_at,
          updated_at
        from school_branches
        where
          school_id =
            ${access.school.id}::uuid
          and status =
            'ACTIVE'::school_branch_status
        order by
          is_headquarters desc,
          name asc
      `);

    return {
      access,
      organizationAdmin: false,
      branches:
        rowsOf(result),
    };
  }

  const result =
    await db.execute(sql`
      select
        b.id,
        b.name,
        b.code,
        b.address,
        b.is_headquarters,
        b.status,
        b.created_at,
        b.updated_at
      from school_branch_admin_assignments a
      join school_branches b
        on b.school_id = a.school_id
       and b.id = a.branch_id
      where
        a.school_id =
          ${access.school.id}::uuid
        and a.membership_id =
          ${access.membership.id}::uuid
        and a.is_active = true
        and b.status =
          'ACTIVE'::school_branch_status
      order by b.name asc
    `);

  return {
    access,
    organizationAdmin: false,
    branches: rowsOf(result),
  };
}

export async function createBranch(
  input: {
    access: SchoolAccess;
    name: string;
    code: string;
    address: string | null;
  },
) {
  const db = getDb();

  try {
    const result =
      await db.execute(sql`
        insert into school_branches (
          id,
          school_id,
          name,
          code,
          is_headquarters,
          status,
          address,
          created_at,
          updated_at
        )
        values (
          gen_random_uuid(),
          ${input.access.school.id}::uuid,
          ${input.name},
          ${input.code.toUpperCase()},
          false,
          'ACTIVE'::school_branch_status,
          ${input.address},
          now(),
          now()
        )
        returning
          id,
          name,
          code,
          address,
          is_headquarters,
          status
      `);

    return rowsOf(result)[0] ?? null;
  } catch (error) {
    if (
      (error as { code?: string })?.code ===
      "23505"
    ) {
      throw new SchoolOperationsError(
        "A branch with this name or code already exists.",
        409,
        "BRANCH_CONFLICT",
      );
    }

    throw error;
  }
}

export async function updateBranch(
  input: {
    access: SchoolAccess;
    branchId: string;
    name: string;
    code: string;
    address: string | null;
    status: "ACTIVE" | "INACTIVE";
  },
) {
  const db = getDb();

  const current =
    await db.execute(sql`
      select
        is_headquarters
      from school_branches
      where
        school_id =
          ${input.access.school.id}::uuid
        and id =
          ${input.branchId}::uuid
      limit 1
    `);

  const branch =
    rowsOf<{
      is_headquarters: boolean;
    }>(current)[0];

  if (!branch) {
    throw new SchoolOperationsError(
      "Branch not found.",
      404,
      "BRANCH_NOT_FOUND",
    );
  }

  if (
    branch.is_headquarters &&
    input.status === "INACTIVE"
  ) {
    throw new SchoolOperationsError(
      "The headquarters branch cannot be deactivated.",
      409,
      "HEADQUARTERS_REQUIRED",
    );
  }

  const result =
    await db.execute(sql`
      update school_branches
      set
        name = ${input.name},
        code =
          ${input.code.toUpperCase()},
        address = ${input.address},
        status =
          ${input.status}::school_branch_status,
        updated_at = now()
      where
        school_id =
          ${input.access.school.id}::uuid
        and id =
          ${input.branchId}::uuid
      returning
        id,
        name,
        code,
        address,
        is_headquarters,
        status
    `);

  return rowsOf(result)[0] ?? null;
}

export async function assignBranchAdministrator(
  input: {
    access: SchoolAccess;
    branchId: string;
    membershipId: string;
    active: boolean;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      with valid as (
        select m.id
        from school_memberships m
        join school_branches b
          on b.school_id =
             m.school_id
         and b.id =
             ${input.branchId}::uuid
        where
          m.school_id =
            ${input.access.school.id}::uuid
          and m.id =
            ${input.membershipId}::uuid
          and m.status =
            'ACTIVE'::school_membership_status
      )
      insert into school_branch_admin_assignments (
        id,
        school_id,
        branch_id,
        membership_id,
        is_active,
        assigned_by_membership_id,
        created_at,
        updated_at
      )
      select
        gen_random_uuid(),
        ${input.access.school.id}::uuid,
        ${input.branchId}::uuid,
        valid.id,
        ${input.active},
        ${input.access.membership.id}::uuid,
        now(),
        now()
      from valid
      on conflict (
        school_id,
        branch_id,
        membership_id
      )
      do update set
        is_active =
          excluded.is_active,
        assigned_by_membership_id =
          excluded.assigned_by_membership_id,
        updated_at = now()
      returning
        id,
        membership_id,
        is_active
    `);

  const assignment =
    rowsOf(result)[0];

  if (!assignment) {
    throw new SchoolOperationsError(
      "Branch or active school membership was not found.",
      404,
      "BRANCH_ADMIN_TARGET_NOT_FOUND",
    );
  }

  return assignment;
}

export async function listBranchAdministrators(
  schoolId: string,
  branchId: string,
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        a.id as assignment_id,
        a.membership_id,
        a.is_active,
        u.full_name,
        u.email,
        u.phone,
        m.status as membership_status,
        a.created_at,
        a.updated_at
      from school_branch_admin_assignments a
      join school_memberships m
        on m.school_id = a.school_id
       and m.id = a.membership_id
      join users u
        on u.id = m.user_id
      where
        a.school_id =
          ${schoolId}::uuid
        and a.branch_id =
          ${branchId}::uuid
      order by u.full_name asc
    `);

  return rowsOf(result);
}

export async function setBranchClassArms(
  input: {
    access: SchoolAccess;
    branchId: string;
    classArmIds: string[];
  },
) {
  const db = getDb();

  const distinct =
    [...new Set(input.classArmIds)];

  const valid =
    await db.execute(sql`
      select
        ca.id,
        cl.section_id
      from class_arms ca
      join class_levels cl
        on cl.school_id =
           ca.school_id
       and cl.id =
           ca.class_level_id
      where
        ca.school_id =
          ${input.access.school.id}::uuid
        and ca.id =
          any(${distinct}::uuid[])
        and ca.is_active = true
        and cl.is_active = true
    `);

  const validRows =
    rowsOf<{
      id: string;
      section_id: string | null;
    }>(valid);

  if (
    validRows.length !==
    distinct.length
  ) {
    throw new SchoolOperationsError(
      "One or more selected class arms are invalid or inactive.",
      400,
      "INVALID_CLASS_ARM",
    );
  }

  await db.execute(sql`
    delete from school_branch_class_arms
    where
      school_id =
        ${input.access.school.id}::uuid
      and branch_id =
        ${input.branchId}::uuid
  `);

  if (distinct.length) {
    await db.execute(sql`
      delete from school_branch_class_arms
      where
        school_id =
          ${input.access.school.id}::uuid
        and class_arm_id =
          any(${distinct}::uuid[])
    `);

    await db.execute(sql`
      insert into school_branch_class_arms (
        id,
        school_id,
        branch_id,
        class_arm_id,
        created_at
      )
      select
        gen_random_uuid(),
        ${input.access.school.id}::uuid,
        ${input.branchId}::uuid,
        value,
        now()
      from unnest(
        ${distinct}::uuid[]
      ) as value
    `);
  }

  await db.execute(sql`
    delete from school_branch_sections
    where
      school_id =
        ${input.access.school.id}::uuid
      and branch_id =
        ${input.branchId}::uuid
  `);

  const sections =
    [
      ...new Set(
        validRows
          .map((row) => row.section_id)
          .filter(
            (value): value is string =>
              Boolean(value),
          ),
      ),
    ];

  if (sections.length) {
    await db.execute(sql`
      insert into school_branch_sections (
        id,
        school_id,
        branch_id,
        section_id,
        created_at
      )
      select
        gen_random_uuid(),
        ${input.access.school.id}::uuid,
        ${input.branchId}::uuid,
        value,
        now()
      from unnest(
        ${sections}::uuid[]
      ) as value
      on conflict do nothing
    `);
  }

  return {
    classArmCount: distinct.length,
    sectionCount: sections.length,
  };
}

export async function assignTerminalToBranch(
  input: {
    access: SchoolAccess;
    branchId: string;
    terminalId: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      with valid as (
        select t.id
        from attendance_terminals t
        join school_branches b
          on b.school_id = t.school_id
         and b.id =
             ${input.branchId}::uuid
        where
          t.school_id =
            ${input.access.school.id}::uuid
          and t.id =
            ${input.terminalId}::uuid
      )
      insert into school_branch_terminals (
        id,
        school_id,
        branch_id,
        terminal_id,
        created_at
      )
      select
        gen_random_uuid(),
        ${input.access.school.id}::uuid,
        ${input.branchId}::uuid,
        valid.id,
        now()
      from valid
      on conflict (
        school_id,
        terminal_id
      )
      do update set
        branch_id =
          excluded.branch_id
      returning
        id,
        terminal_id,
        branch_id
    `);

  const assignment =
    rowsOf(result)[0];

  if (!assignment) {
    throw new SchoolOperationsError(
      "Terminal or branch was not found.",
      404,
      "TERMINAL_BRANCH_TARGET_NOT_FOUND",
    );
  }

  return assignment;
}

export async function getBranchOperationalView(
  schoolId: string,
  branchId: string,
) {
  const db = getDb();

  const [
    sections,
    classes,
    terminals,
    students,
  ] =
    await Promise.all([
      db.execute(sql`
        select
          s.id,
          s.name,
          s.code,
          s.sort_order
        from school_branch_sections x
        join school_sections s
          on s.school_id = x.school_id
         and s.id = x.section_id
        where
          x.school_id =
            ${schoolId}::uuid
          and x.branch_id =
            ${branchId}::uuid
        order by
          s.sort_order asc,
          s.name asc
      `),
      db.execute(sql`
        select
          ca.id,
          ca.name,
          ca.code,
          cl.id as class_level_id,
          cl.name as class_level_name,
          cl.sort_order,
          cl.section_id
        from school_branch_class_arms x
        join class_arms ca
          on ca.school_id = x.school_id
         and ca.id = x.class_arm_id
        join class_levels cl
          on cl.school_id = ca.school_id
         and cl.id = ca.class_level_id
        where
          x.school_id =
            ${schoolId}::uuid
          and x.branch_id =
            ${branchId}::uuid
        order by
          cl.sort_order asc,
          ca.name asc
      `),
      db.execute(sql`
        select
          t.id,
          t.name,
          t.status
        from school_branch_terminals x
        join attendance_terminals t
          on t.school_id = x.school_id
         and t.id = x.terminal_id
        where
          x.school_id =
            ${schoolId}::uuid
          and x.branch_id =
            ${branchId}::uuid
        order by t.name asc
      `),
      db.execute(sql`
        select
          s.id,
          s.casa_student_id,
          s.admission_number,
          s.first_name,
          s.middle_name,
          s.last_name,
          s.sex,
          e.id as enrollment_id,
          ca.id as class_arm_id,
          ca.name as class_arm_name,
          cl.id as class_level_id,
          cl.name as class_level_name,
          cl.section_id
        from student_enrollments e
        join school_branch_class_arms x
          on x.school_id = e.school_id
         and x.class_arm_id = e.class_arm_id
        join students s
          on s.school_id = e.school_id
         and s.id = e.student_id
        join class_arms ca
          on ca.school_id = e.school_id
         and ca.id = e.class_arm_id
        join class_levels cl
          on cl.school_id = ca.school_id
         and cl.id = ca.class_level_id
        where
          e.school_id =
            ${schoolId}::uuid
          and x.branch_id =
            ${branchId}::uuid
          and e.status =
            'ACTIVE'::student_enrollment_status
        order by
          cl.sort_order asc,
          ca.name asc,
          s.last_name asc,
          s.first_name asc
      `),
    ]);

  return {
    sections: rowsOf(sections),
    classes: rowsOf(classes),
    terminals: rowsOf(terminals),
    students: rowsOf(students),
  };
}

export async function listCalendarEvents(
  input: {
    schoolId: string;
    branchId: string | null;
    startsOn: string;
    endsOn: string;
  },
) {
  const db = getDb();

  const result =
    input.branchId
      ? await db.execute(sql`
          select *
          from school_calendar_events
          where
            school_id =
              ${input.schoolId}::uuid
            and starts_on <=
              ${input.endsOn}::date
            and ends_on >=
              ${input.startsOn}::date
            and (
              branch_id is null
              or branch_id =
                ${input.branchId}::uuid
            )
          order by
            starts_on asc,
            title asc
        `)
      : await db.execute(sql`
          select *
          from school_calendar_events
          where
            school_id =
              ${input.schoolId}::uuid
            and branch_id is null
            and starts_on <=
              ${input.endsOn}::date
            and ends_on >=
              ${input.startsOn}::date
          order by
            starts_on asc,
            title asc
        `);

  return rowsOf(result);
}

export async function createCalendarEvent(
  input: {
    access: SchoolAccess;
    branchId: string | null;
    kind:
      | "PUBLIC_HOLIDAY"
      | "SCHOOL_BREAK"
      | "BRANCH_CLOSURE"
      | "SPECIAL_NON_INSTRUCTIONAL_DAY";
    title: string;
    startsOn: string;
    endsOn: string;
    academicSessionId: string | null;
    academicTermId: string | null;
    notes: string | null;
  },
) {
  if (
    input.endsOn <
    input.startsOn
  ) {
    throw new SchoolOperationsError(
      "Calendar event end date cannot be before its start date.",
      400,
      "INVALID_CALENDAR_DATES",
    );
  }

  if (
    input.kind ===
      "BRANCH_CLOSURE" &&
    !input.branchId
  ) {
    throw new SchoolOperationsError(
      "A branch closure must target one branch.",
      400,
      "BRANCH_REQUIRED",
    );
  }

  const db = getDb();

  const result =
    await db.execute(sql`
      insert into school_calendar_events (
        id,
        school_id,
        branch_id,
        academic_session_id,
        academic_term_id,
        kind,
        title,
        starts_on,
        ends_on,
        notes,
        created_by_membership_id,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid(),
        ${input.access.school.id}::uuid,
        ${input.branchId}::uuid,
        ${input.academicSessionId}::uuid,
        ${input.academicTermId}::uuid,
        ${input.kind}::school_calendar_event_kind,
        ${input.title},
        ${input.startsOn}::date,
        ${input.endsOn}::date,
        ${input.notes},
        ${input.access.membership.id}::uuid,
        now(),
        now()
      )
      returning *
    `);

  return rowsOf(result)[0] ?? null;
}

export async function updateCalendarEvent(
  input: {
    access: SchoolAccess;
    eventId: string;
    kind:
      | "PUBLIC_HOLIDAY"
      | "SCHOOL_BREAK"
      | "BRANCH_CLOSURE"
      | "SPECIAL_NON_INSTRUCTIONAL_DAY";
    title: string;
    startsOn: string;
    endsOn: string;
    notes: string | null;
  },
) {
  if (
    input.endsOn <
    input.startsOn
  ) {
    throw new SchoolOperationsError(
      "Calendar event end date cannot be before its start date.",
      400,
      "INVALID_CALENDAR_DATES",
    );
  }

  const db = getDb();

  const result =
    await db.execute(sql`
      update school_calendar_events
      set
        kind =
          ${input.kind}::school_calendar_event_kind,
        title = ${input.title},
        starts_on =
          ${input.startsOn}::date,
        ends_on =
          ${input.endsOn}::date,
        notes = ${input.notes},
        updated_at = now()
      where
        school_id =
          ${input.access.school.id}::uuid
        and id =
          ${input.eventId}::uuid
      returning *
    `);

  const event =
    rowsOf(result)[0];

  if (!event) {
    throw new SchoolOperationsError(
      "Calendar event not found.",
      404,
      "CALENDAR_EVENT_NOT_FOUND",
    );
  }

  return event;
}

export async function getCalendarEventScope(
  schoolId: string,
  eventId: string,
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        branch_id,
        kind
      from school_calendar_events
      where
        school_id =
          ${schoolId}::uuid
        and id =
          ${eventId}::uuid
      limit 1
    `);

  return rowsOf<{
    branch_id: string | null;
    kind:
      | "PUBLIC_HOLIDAY"
      | "SCHOOL_BREAK"
      | "BRANCH_CLOSURE"
      | "SPECIAL_NON_INSTRUCTIONAL_DAY";
  }>(result)[0] ?? null;
}

export async function listAttendanceExcuses(
  input: {
    schoolId: string;
    branchId: string;
    startsOn: string;
    endsOn: string;
    includeRevoked: boolean;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        e.id,
        e.student_id,
        s.first_name,
        s.middle_name,
        s.last_name,
        e.starts_on,
        e.ends_on,
        e.reason,
        e.status,
        e.approved_by_membership_id,
        e.revoked_at,
        e.created_at
      from student_attendance_excuses e
      join students s
        on s.school_id =
           e.school_id
       and s.id =
           e.student_id
      where
        e.school_id =
          ${input.schoolId}::uuid
        and e.branch_id =
          ${input.branchId}::uuid
        and e.starts_on <=
          ${input.endsOn}::date
        and e.ends_on >=
          ${input.startsOn}::date
        and (
          ${input.includeRevoked}
          or e.status =
            'ACTIVE'::student_attendance_excuse_status
        )
      order by e.created_at desc
    `);

  return rowsOf(result);
}

export async function createAttendanceExcuse(
  input: {
    access: SchoolAccess;
    branchId: string;
    studentId: string;
    startsOn: string;
    endsOn: string;
    reason: string;
  },
) {
  if (
    input.endsOn <
    input.startsOn
  ) {
    throw new SchoolOperationsError(
      "Excused absence end date cannot be before its start date.",
      400,
      "INVALID_EXCUSE_DATES",
    );
  }

  const db = getDb();

  const result =
    await db.execute(sql`
      with current_student as (
        select s.id
        from students s
        join student_enrollments e
          on e.school_id = s.school_id
         and e.student_id = s.id
         and e.status =
           'ACTIVE'::student_enrollment_status
        join school_branch_class_arms x
          on x.school_id = e.school_id
         and x.class_arm_id = e.class_arm_id
        where
          s.school_id =
            ${input.access.school.id}::uuid
          and s.id =
            ${input.studentId}::uuid
          and s.status =
            'ACTIVE'::student_status
          and x.branch_id =
            ${input.branchId}::uuid
      ),
      overlap as (
        select id
        from student_attendance_excuses
        where
          school_id =
            ${input.access.school.id}::uuid
          and student_id =
            ${input.studentId}::uuid
          and status =
            'ACTIVE'::student_attendance_excuse_status
          and starts_on <=
            ${input.endsOn}::date
          and ends_on >=
            ${input.startsOn}::date
        limit 1
      )
      insert into student_attendance_excuses (
        id,
        school_id,
        branch_id,
        student_id,
        starts_on,
        ends_on,
        reason,
        status,
        approved_by_membership_id,
        created_at,
        updated_at
      )
      select
        gen_random_uuid(),
        ${input.access.school.id}::uuid,
        ${input.branchId}::uuid,
        current_student.id,
        ${input.startsOn}::date,
        ${input.endsOn}::date,
        ${input.reason},
        'ACTIVE'::student_attendance_excuse_status,
        ${input.access.membership.id}::uuid,
        now(),
        now()
      from current_student
      where not exists (
        select 1 from overlap
      )
      returning *
    `);

  const excuse =
    rowsOf(result)[0];

  if (excuse) {
    return excuse;
  }

  const overlap =
    await db.execute(sql`
      select exists (
        select 1
        from student_attendance_excuses
        where
          school_id =
            ${input.access.school.id}::uuid
          and student_id =
            ${input.studentId}::uuid
          and status =
            'ACTIVE'::student_attendance_excuse_status
          and starts_on <=
            ${input.endsOn}::date
          and ends_on >=
            ${input.startsOn}::date
      ) as present
    `);

  if (
    rowsOf<{ present: boolean }>(
      overlap,
    )[0]?.present
  ) {
    throw new SchoolOperationsError(
      "This student already has an overlapping active excused absence.",
      409,
      "EXCUSE_OVERLAP",
    );
  }

  throw new SchoolOperationsError(
    "Student does not have an active enrollment in this branch.",
    409,
    "STUDENT_BRANCH_MISMATCH",
  );
}

export async function revokeAttendanceExcuse(
  input: {
    access: SchoolAccess;
    branchId: string;
    excuseId: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      update student_attendance_excuses
      set
        status =
          'REVOKED'::student_attendance_excuse_status,
        revoked_by_membership_id =
          ${input.access.membership.id}::uuid,
        revoked_at = now(),
        updated_at = now()
      where
        school_id =
          ${input.access.school.id}::uuid
        and branch_id =
          ${input.branchId}::uuid
        and id =
          ${input.excuseId}::uuid
        and status =
          'ACTIVE'::student_attendance_excuse_status
      returning *
    `);

  const excuse =
    rowsOf(result)[0];

  if (!excuse) {
    throw new SchoolOperationsError(
      "Active attendance excuse not found.",
      404,
      "EXCUSE_NOT_FOUND",
    );
  }

  return excuse;
}
