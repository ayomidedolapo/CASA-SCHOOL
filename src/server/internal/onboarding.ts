import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  registerStudentOnce,
} from "@/server/students/registration";
import type {
  CasaInternalAccess,
  CasaInternalSchoolAccess,
} from "./authorization";

export type CasaOnboardingFaceFilter =
  | "ALL"
  | "NEEDED"
  | "COMPLETE"
  | "REVIEW";

export type CasaOnboardingCompletionFilter =
  | "ALL"
  | "INCOMPLETE"
  | "COMPLETE";

export type CasaOnboardingSectionFilter =
  | "ALL"
  | "PRIMARY"
  | "SECONDARY";

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

export async function writeCasaInternalAudit(
  input: {
    access:
      CasaInternalAccess;
    schoolId?:
      string | null;
    action: string;
    subjectType?:
      string | null;
    subjectId?:
      string | null;
    metadata?:
      Record<string, unknown>;
  },
) {
  const db = getDb();

  await db.execute(sql`
    insert into casa_internal_audit_logs (
      actor_membership_id,
      school_id,
      action,
      subject_type,
      subject_id,
      metadata,
      created_at
    )
    values (
      ${input.access.membership.id}::uuid,
      ${input.schoolId ?? null}::uuid,
      ${input.action},
      ${input.subjectType ?? null},
      ${input.subjectId ?? null}::uuid,
      ${JSON.stringify(
        input.metadata ?? {},
      )}::jsonb,
      now()
    )
  `);
}

export async function listCasaInternalSchools(
  access: CasaInternalAccess,
) {
  void access;
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        school.id,
        school.slug,
        school.name,
        school.timezone
      from schools
        school
      where
        school.status =
          'ACTIVE'::school_status
      order by
        school.name asc
    `);

  return rowsOf<{
    id: string;
    slug: string;
    name: string;
    timezone: string;
  }>(
    result,
  );
}

export async function searchCasaOnboardingStudents(
  input: {
    access:
      CasaInternalSchoolAccess;
    query: string;
    page: number;
    pageSize: number;
    branchId:
      string | null;
    section:
      CasaOnboardingSectionFilter;
    face:
      CasaOnboardingFaceFilter;
    completion:
      CasaOnboardingCompletionFilter;
  },
) {
  const db = getDb();
  const q =
    input.query
      .trim()
      .slice(0, 120);
  const pattern =
    `%${q}%`;
  const offset =
    (input.page - 1) *
    input.pageSize;

  const result =
    await db.execute(sql`
      with base as (
        select
          student.id,
          student.casa_student_id,
          student.admission_number,
          student.first_name,
          student.middle_name,
          student.last_name,
          student.preferred_name,
          student.date_of_birth::text
            as date_of_birth,
          student.sex::text
            as sex,
          student.status::text
            as status,
          student.admission_date::text
            as admission_date,
          student.home_branch_id,
          home_branch.name
            as home_branch_name,
          enrollment.id
            as enrollment_id,
          arm.id
            as class_arm_id,
          arm.name
            as class_arm_name,
          level.id
            as class_level_id,
          level.name
            as class_level_name,
          section.id
            as section_id,
          section.name
            as section_name,
          guardian.guardian_count,
          guardian.guardian_search_text,
          case
            when biometric.active_count > 0
              then 'COMPLETE'
            when biometric.total_count > 0
              then 'REVIEW'
            else 'NEEDED'
          end as face_status,
          case
            when card.active_count > 0
              then 'COMPLETE'
            when production.job_count > 0
              then 'IN_PROGRESS'
            else 'NEEDED'
          end as card_production_need,
          (
            guardian.guardian_count > 0
            and enrollment.id is not null
            and biometric.active_count > 0
          ) as onboarding_complete,
          lock.membership_id
            as lock_membership_id,
          lock.locked_at,
          lock.expires_at,
          lock_holder.full_name
            as lock_holder_name
        from students
          student
        left join school_branches
          home_branch
          on home_branch.school_id =
             student.school_id
         and home_branch.id =
             student.home_branch_id
        left join lateral (
          select
            active.id,
            active.class_arm_id
          from student_enrollments
            active
          where
            active.school_id =
              student.school_id
            and active.student_id =
              student.id
            and active.status =
              'ACTIVE'::student_enrollment_status
          order by
            active.starts_on desc,
            active.created_at desc
          limit 1
        ) enrollment
          on true
        left join class_arms
          arm
          on arm.school_id =
             student.school_id
         and arm.id =
             enrollment.class_arm_id
        left join class_levels
          level
          on level.school_id =
             student.school_id
         and level.id =
             arm.class_level_id
        left join school_sections
          section
          on section.school_id =
             student.school_id
         and section.id =
             level.section_id
        left join lateral (
          select
            count(*)::int
              as guardian_count,
            coalesce(
              string_agg(
                concat_ws(
                  ' ',
                  linked.full_name,
                  linked.phone,
                  linked.email
                ),
                ' '
              ),
              ''
            ) as guardian_search_text
          from student_guardians
            link
          join guardians
            linked
            on linked.school_id =
               link.school_id
           and linked.id =
               link.guardian_id
          where
            link.school_id =
              student.school_id
            and link.student_id =
              student.id
        ) guardian
          on true
        left join lateral (
          select
            count(*)::int
              as total_count,
            count(*) filter (
              where profile.status =
                'ACTIVE'::student_biometric_profile_status
            )::int as active_count
          from student_biometric_profiles
            profile
          where
            profile.school_id =
              student.school_id
            and profile.student_id =
              student.id
        ) biometric
          on true
        left join lateral (
          select
            count(*) filter (
              where identity.status =
                'ACTIVE'::student_identity_card_status
            )::int as active_count
          from student_identity_cards
            identity
          where
            identity.school_id =
              student.school_id
            and identity.student_id =
              student.id
        ) card
          on true
        left join lateral (
          select
            count(*)::int
              as job_count
          from student_card_production_jobs
            job
          where
            job.school_id =
              student.school_id
            and job.student_id =
              student.id
            and job.status in (
              'READY'::student_card_production_status,
              'EXPORTED'::student_card_production_status,
              'PRINTED'::student_card_production_status
            )
        ) production
          on true
        left join casa_internal_onboarding_locks
          lock
          on lock.school_id =
             student.school_id
         and lock.student_id =
             student.id
         and lock.expires_at > now()
        left join casa_internal_memberships
          lock_member
          on lock_member.id =
             lock.membership_id
        left join users
          lock_holder
          on lock_holder.id =
             lock_member.user_id
        where
          student.school_id =
            ${input.access.school.id}::uuid
          and student.status <>
            'ARCHIVED'::student_status
          and (
            ${input.branchId}::uuid is null
            or student.home_branch_id =
              ${input.branchId}::uuid
          )
      ),
      filtered as (
        select *
        from base
        where
          (
            ${q} = ''
            or casa_student_id ilike
              ${pattern}
            or coalesce(
              admission_number,
              ''
            ) ilike ${pattern}
            or first_name ilike
              ${pattern}
            or coalesce(
              middle_name,
              ''
            ) ilike ${pattern}
            or last_name ilike
              ${pattern}
            or coalesce(
              preferred_name,
              ''
            ) ilike ${pattern}
            or coalesce(
              class_arm_name,
              ''
            ) ilike ${pattern}
            or coalesce(
              class_level_name,
              ''
            ) ilike ${pattern}
            or guardian_search_text ilike
              ${pattern}
          )
          and (
            ${input.section} = 'ALL'
            or (
              ${input.section} = 'PRIMARY'
              and (
                upper(
                  coalesce(
                    section_name,
                    ''
                  )
                ) like '%PRIMARY%'
                or upper(
                  coalesce(
                    class_level_name,
                    ''
                  )
                ) like '%PRIMARY%'
              )
            )
            or (
              ${input.section} = 'SECONDARY'
              and (
                upper(
                  coalesce(
                    section_name,
                    ''
                  )
                ) like '%SECONDARY%'
                or upper(
                  coalesce(
                    class_level_name,
                    ''
                  )
                ) like '%SECONDARY%'
              )
            )
          )
          and (
            ${input.face} = 'ALL'
            or face_status =
              ${input.face}
          )
          and (
            ${input.completion} = 'ALL'
            or (
              ${input.completion} =
                'COMPLETE'
              and onboarding_complete
            )
            or (
              ${input.completion} =
                'INCOMPLETE'
              and not onboarding_complete
            )
          )
      )
      select
        *,
        count(*) over()::int
          as total_count
      from filtered
      order by
        last_name asc,
        first_name asc,
        casa_student_id asc
      limit ${input.pageSize}
      offset ${offset}
    `);

  const rows =
    rowsOf<Record<
      string,
      unknown
    >>(
      result,
    );

  const total =
    Number(
      rows[0]?.total_count ??
      0,
    );

  return {
    students:
      rows.map(
        ({
          total_count:
            _totalCount,
          ...row
        }) => row,
      ),
    pagination: {
      page:
        input.page,
      pageSize:
        input.pageSize,
      total,
      pages:
        Math.max(
          1,
          Math.ceil(
            total /
            input.pageSize,
          ),
        ),
    },
  };
}

export async function getCasaOnboardingStudent(
  input: {
    access:
      CasaInternalSchoolAccess;
    studentId: string;
  },
) {
  const db = getDb();

  const studentResult =
    await db.execute(sql`
      select
        student.id,
        student.casa_student_id,
        student.admission_number,
        student.first_name,
        student.middle_name,
        student.last_name,
        student.preferred_name,
        student.date_of_birth::text
          as date_of_birth,
        student.sex::text
          as sex,
        student.status::text
          as status,
        student.admission_date::text
          as admission_date,
        student.home_branch_id,
        home_branch.name
          as home_branch_name,
        case
          when exists (
            select 1
            from student_biometric_profiles
              profile
            where
              profile.school_id =
                student.school_id
              and profile.student_id =
                student.id
              and profile.status =
                'ACTIVE'::student_biometric_profile_status
          ) then 'COMPLETE'
          when exists (
            select 1
            from student_biometric_profiles
              profile
            where
              profile.school_id =
                student.school_id
              and profile.student_id =
                student.id
          ) then 'REVIEW'
          else 'NEEDED'
        end as face_status,
        case
          when exists (
            select 1
            from student_identity_cards
              identity
            where
              identity.school_id =
                student.school_id
              and identity.student_id =
                student.id
              and identity.status =
                'ACTIVE'::student_identity_card_status
          ) then 'COMPLETE'
          when exists (
            select 1
            from student_card_production_jobs
              job
            where
              job.school_id =
                student.school_id
              and job.student_id =
                student.id
              and job.status in (
                'READY'::student_card_production_status,
                'EXPORTED'::student_card_production_status,
                'PRINTED'::student_card_production_status
              )
          ) then 'IN_PROGRESS'
          else 'NEEDED'
        end as card_production_need
      from students
        student
      left join school_branches
        home_branch
        on home_branch.school_id =
           student.school_id
       and home_branch.id =
           student.home_branch_id
      where
        student.school_id =
          ${input.access.school.id}::uuid
        and student.id =
          ${input.studentId}::uuid
        and student.status <>
          'ARCHIVED'::student_status
      limit 1
    `);

  const student =
    rowsOf<Record<
      string,
      unknown
    >>(
      studentResult,
    )[0];

  if (!student) {
    return null;
  }

  const [
    guardianResult,
    enrollmentResult,
    lockResult,
  ] =
    await Promise.all([
      db.execute(sql`
        select
          guardian.id,
          guardian.full_name,
          guardian.email,
          guardian.phone,
          link.relationship_label,
          link.is_primary,
          link.is_emergency_contact,
          link.pickup_authorized,
          link.receives_notifications
        from student_guardians
          link
        join guardians
          guardian
          on guardian.school_id =
             link.school_id
         and guardian.id =
             link.guardian_id
        where
          link.school_id =
            ${input.access.school.id}::uuid
          and link.student_id =
            ${input.studentId}::uuid
        order by
          link.is_primary desc,
          guardian.full_name asc
      `),
      db.execute(sql`
        select
          enrollment.id,
          enrollment.status::text
            as status,
          enrollment.starts_on::text
            as starts_on,
          enrollment.ends_on::text
            as ends_on,
          academic.id
            as academic_session_id,
          academic.name
            as academic_session_name,
          arm.id
            as class_arm_id,
          arm.name
            as class_arm_name,
          level.name
            as class_level_name,
          section.name
            as section_name,
          branch.id
            as branch_id,
          branch.name
            as branch_name,
          arrival.arrival_method::text
            as arrival_method
        from student_enrollments
          enrollment
        join academic_sessions
          academic
          on academic.school_id =
             enrollment.school_id
         and academic.id =
             enrollment.academic_session_id
        join class_arms
          arm
          on arm.school_id =
             enrollment.school_id
         and arm.id =
             enrollment.class_arm_id
        join class_levels
          level
          on level.school_id =
             enrollment.school_id
         and level.id =
             arm.class_level_id
        left join school_sections
          section
          on section.school_id =
             enrollment.school_id
         and section.id =
             level.section_id
        join school_branch_class_arms branch_arm
          on branch_arm.school_id =
             enrollment.school_id
         and branch_arm.class_arm_id =
             enrollment.class_arm_id
        join school_branches branch
          on branch.school_id =
             branch_arm.school_id
         and branch.id =
             branch_arm.branch_id
        left join lateral (
          select assignment.arrival_method
          from student_arrival_method_assignments assignment
          where assignment.school_id =
            enrollment.school_id
            and assignment.student_id =
              enrollment.student_id
            and assignment.effective_from <=
              coalesce(
                enrollment.ends_on,
                current_date
              )
            and (
              assignment.effective_to is null
              or assignment.effective_to >=
                 enrollment.starts_on
            )
          order by assignment.effective_from desc
          limit 1
        ) arrival on true
        where
          enrollment.school_id =
            ${input.access.school.id}::uuid
          and enrollment.student_id =
            ${input.studentId}::uuid
        order by
          enrollment.starts_on desc
      `),
      db.execute(sql`
        select
          lock.membership_id,
          lock.locked_at,
          lock.expires_at,
          actor.full_name
            as holder_name
        from casa_internal_onboarding_locks
          lock
        join casa_internal_memberships
          membership
          on membership.id =
             lock.membership_id
        join users
          actor
          on actor.id =
             membership.user_id
        where
          lock.school_id =
            ${input.access.school.id}::uuid
          and lock.student_id =
            ${input.studentId}::uuid
          and lock.expires_at >
            now()
        limit 1
      `),
    ]);

  const guardians =
    rowsOf<Record<
      string,
      unknown
    >>(
      guardianResult,
    );
  const enrollments =
    rowsOf<Record<
      string,
      unknown
    >>(
      enrollmentResult,
    );
  const lock =
    rowsOf<Record<
      string,
      unknown
    >>(
      lockResult,
    )[0] ??
    null;

  return {
    student,
    guardians,
    enrollments,
    lock,
    onboardingComplete:
      guardians.length > 0 &&
      enrollments.some(
        (item) =>
          item.status ===
            "ACTIVE" &&
          Boolean(
            item.branch_id &&
            item.arrival_method,
          ),
      ) &&
      student.face_status ===
        "COMPLETE",
  };
}

export async function createCasaOnboardingStudent(
  input: {
    access:
      CasaInternalSchoolAccess;
    branchId?:
      | string
      | null;
    admissionNumber?:
      string | null;
    firstName: string;
    middleName?:
      string | null;
    lastName: string;
    preferredName?:
      string | null;
    dateOfBirth: string;
    sex:
      | "MALE"
      | "FEMALE"
      | "UNSPECIFIED";
    admissionDate: string;
  },
) {
  const student =
    await registerStudentOnce({
      schoolId:
        input.access.school.id,
      branchId:
        input.branchId ??
        null,
      admissionNumber:
        input.admissionNumber,
      firstName:
        input.firstName,
      middleName:
        input.middleName,
      lastName:
        input.lastName,
      preferredName:
        input.preferredName,
      dateOfBirth:
        input.dateOfBirth,
      sex:
        input.sex,
      admissionDate:
        input.admissionDate,
    });

  try {
    await writeCasaInternalAudit({
      access:
        input.access,
      schoolId:
        input.access.school.id,
      action:
        "ONBOARDING_STUDENT_CREATED",
      subjectType:
        "STUDENT",
      subjectId:
        String(
          student.id,
        ),
      metadata: {
        homeBranchId:
          student.home_branch_id,
      },
    });
  } catch (
    auditError
  ) {
    console.error(
      "Student registration succeeded but the CASA internal audit write failed.",
      auditError,
    );
  }

  return student;
}

export async function updateCasaOnboardingStudent(
  input: {
    access:
      CasaInternalSchoolAccess;
    studentId: string;
    admissionNumber?:
      string | null;
    firstName?: string;
    middleName?:
      string | null;
    lastName?: string;
    preferredName?:
      string | null;
    dateOfBirth?: string;
    sex?:
      | "MALE"
      | "FEMALE"
      | "UNSPECIFIED";
    admissionDate?: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      update students
      set
        admission_number =
          case
            when ${input.admissionNumber !==
              undefined}
              then ${input.admissionNumber
                ?.trim()
                .toUpperCase() ??
                null}
            else admission_number
          end,
        first_name =
          case
            when ${input.firstName !==
              undefined}
              then ${input.firstName
                ?.trim() ??
                null}
            else first_name
          end,
        middle_name =
          case
            when ${input.middleName !==
              undefined}
              then ${input.middleName
                ?.trim() ||
                null}
            else middle_name
          end,
        last_name =
          case
            when ${input.lastName !==
              undefined}
              then ${input.lastName
                ?.trim() ??
                null}
            else last_name
          end,
        preferred_name =
          case
            when ${input.preferredName !==
              undefined}
              then ${input.preferredName
                ?.trim() ||
                null}
            else preferred_name
          end,
        date_of_birth =
          case
            when ${input.dateOfBirth !==
              undefined}
              then ${input.dateOfBirth ??
                null}::date
            else date_of_birth
          end,
        sex =
          case
            when ${input.sex !==
              undefined}
              then ${input.sex ??
                null}::student_sex
            else sex
          end,
        admission_date =
          case
            when ${input.admissionDate !==
              undefined}
              then ${input.admissionDate ??
                null}::date
            else admission_date
          end,
        updated_at = now()
      where
        school_id =
          ${input.access.school.id}::uuid
        and id =
          ${input.studentId}::uuid
      returning
        id,
        casa_student_id,
        admission_number,
        first_name,
        middle_name,
        last_name,
        preferred_name,
        date_of_birth::text
          as date_of_birth,
        sex::text
          as sex,
        admission_date::text
          as admission_date
    `);

  const student =
    rowsOf<Record<
      string,
      unknown
    >>(
      result,
    )[0];

  if (!student) {
    return null;
  }

  await writeCasaInternalAudit({
    access:
      input.access,
    schoolId:
      input.access.school.id,
    action:
      "ONBOARDING_STUDENT_UPDATED",
    subjectType:
      "STUDENT",
    subjectId:
      input.studentId,
  });

  return student;
}

export async function addCasaOnboardingGuardian(
  input: {
    access:
      CasaInternalSchoolAccess;
    studentId: string;
    fullName: string;
    email?:
      string | null;
    phone?:
      string | null;
    relationshipLabel: string;
    isPrimary: boolean;
    isEmergencyContact: boolean;
    pickupAuthorized: boolean;
    receivesNotifications: boolean;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      with student_scope as (
        select id
        from students
        where
          school_id =
            ${input.access.school.id}::uuid
          and id =
            ${input.studentId}::uuid
      ),
      existing_guardian as (
        select guardian.id
        from guardians
          guardian
        where
          guardian.school_id =
            ${input.access.school.id}::uuid
          and guardian.status =
            'ACTIVE'::guardian_status
          and (
            (
              ${input.phone ?? null}
                is not null
              and guardian.phone =
                ${input.phone ?? null}
            )
            or (
              ${input.email ?? null}
                is not null
              and lower(
                guardian.email
              ) =
                lower(
                  ${input.email ?? null}
                )
            )
          )
        limit 1
      ),
      inserted_guardian as (
        insert into guardians (
          school_id,
          full_name,
          email,
          phone,
          status,
          created_at,
          updated_at
        )
        select
          ${input.access.school.id}::uuid,
          ${input.fullName.trim()},
          ${input.email?.trim() ||
            null},
          ${input.phone?.trim() ||
            null},
          'ACTIVE'::guardian_status,
          now(),
          now()
        from student_scope
        where not exists (
          select 1
          from existing_guardian
        )
        returning id
      ),
      selected_guardian as (
        select id
        from existing_guardian
        union all
        select id
        from inserted_guardian
        limit 1
      ),
      cleared_primary as (
        update student_guardians
        set
          is_primary = false,
          updated_at = now()
        where
          school_id =
            ${input.access.school.id}::uuid
          and student_id =
            ${input.studentId}::uuid
          and is_primary = true
          and ${input.isPrimary} = true
        returning id
      )
      insert into student_guardians (
        school_id,
        student_id,
        guardian_id,
        relationship_label,
        is_primary,
        is_emergency_contact,
        pickup_authorized,
        receives_notifications,
        created_at,
        updated_at
      )
      select
        ${input.access.school.id}::uuid,
        student_scope.id,
        selected_guardian.id,
        ${input.relationshipLabel.trim()},
        ${input.isPrimary},
        ${input.isEmergencyContact},
        ${input.pickupAuthorized},
        ${input.receivesNotifications},
        now(),
        now()
      from student_scope
      cross join selected_guardian
      on conflict (
        school_id,
        student_id,
        guardian_id
      )
      do update set
        relationship_label =
          excluded.relationship_label,
        is_primary =
          excluded.is_primary,
        is_emergency_contact =
          excluded.is_emergency_contact,
        pickup_authorized =
          excluded.pickup_authorized,
        receives_notifications =
          excluded.receives_notifications,
        updated_at = now()
      returning
        guardian_id,
        relationship_label,
        is_primary,
        is_emergency_contact,
        pickup_authorized,
        receives_notifications
    `);

  const linked =
    rowsOf<Record<
      string,
      unknown
    >>(
      result,
    )[0];

  if (!linked) {
    return null;
  }

  await writeCasaInternalAudit({
    access:
      input.access,
    schoolId:
      input.access.school.id,
    action:
      "ONBOARDING_GUARDIAN_LINKED",
    subjectType:
      "STUDENT",
    subjectId:
      input.studentId,
    metadata: {
      guardianId:
        linked.guardian_id,
    },
  });

  return linked;
}

export async function assignCasaOnboardingEnrollment(
  input: {
    access:
      CasaInternalSchoolAccess;
    studentId: string;
    academicSessionId: string;
    branchId: string;
    classArmId: string;
    arrivalMethod:
      | "SCHOOL_BUS"
      | "INDEPENDENT";
    startsOn: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      with valid_scope as (
        select
          student.id
            as student_id,
          academic.id
            as academic_session_id,
          arm.id
            as class_arm_id,
          branch.id
            as branch_id
        from students student
        join academic_sessions academic
          on academic.school_id =
             student.school_id
         and academic.id =
             ${input.academicSessionId}::uuid
        join school_branches branch
          on branch.school_id =
             student.school_id
         and branch.id =
             ${input.branchId}::uuid
         and branch.status =
             'ACTIVE'::school_branch_status
        join school_branch_class_arms branch_arm
          on branch_arm.school_id =
             student.school_id
         and branch_arm.branch_id =
             branch.id
         and branch_arm.class_arm_id =
             ${input.classArmId}::uuid
        join class_arms arm
          on arm.school_id =
             branch_arm.school_id
         and arm.id =
             branch_arm.class_arm_id
         and arm.is_active = true
        where
          student.school_id =
            ${input.access.school.id}::uuid
          and student.id =
            ${input.studentId}::uuid
          and academic.starts_on <=
            ${input.startsOn}::date
          and academic.ends_on >=
            ${input.startsOn}::date
      ),
      enrollment_blocker as (
        select 1
        from student_enrollments existing
        join valid_scope scope
          on scope.student_id =
             existing.student_id
        where
          existing.school_id =
            ${input.access.school.id}::uuid
          and existing.status =
            'ACTIVE'::student_enrollment_status
          and existing.starts_on >=
            ${input.startsOn}::date
        limit 1
      ),
      arrival_blocker as (
        select 1
        from student_arrival_method_assignments existing
        join valid_scope scope
          on scope.student_id =
             existing.student_id
        where
          existing.school_id =
            ${input.access.school.id}::uuid
          and existing.effective_from >
            ${input.startsOn}::date
        limit 1
      ),
      closed_enrollment as (
        update student_enrollments
        set
          status =
            'COMPLETED'::student_enrollment_status,
          ends_on =
            ${input.startsOn}::date - 1,
          updated_at = now()
        where
          school_id =
            ${input.access.school.id}::uuid
          and student_id =
            ${input.studentId}::uuid
          and status =
            'ACTIVE'::student_enrollment_status
          and starts_on <
            ${input.startsOn}::date
          and exists (
            select 1
            from valid_scope
          )
          and not exists (
            select 1
            from enrollment_blocker
          )
          and not exists (
            select 1
            from arrival_blocker
          )
        returning id
      ),
      closed_arrival as (
        update student_arrival_method_assignments
        set
          effective_to =
            ${input.startsOn}::date - 1,
          updated_at = now()
        where
          school_id =
            ${input.access.school.id}::uuid
          and student_id =
            ${input.studentId}::uuid
          and effective_from <
            ${input.startsOn}::date
          and (
            effective_to is null
            or effective_to >=
               ${input.startsOn}::date
          )
          and exists (
            select 1
            from valid_scope
          )
          and not exists (
            select 1
            from enrollment_blocker
          )
          and not exists (
            select 1
            from arrival_blocker
          )
        returning id
      ),
      inserted_enrollment as (
        insert into student_enrollments (
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
          ${input.access.school.id}::uuid,
          scope.student_id,
          scope.academic_session_id,
          scope.class_arm_id,
          'ACTIVE'::student_enrollment_status,
          ${input.startsOn}::date,
          null,
          now(),
          now()
        from valid_scope scope
        where not exists (
          select 1
          from enrollment_blocker
        )
          and not exists (
            select 1
            from arrival_blocker
          )
        returning
          id,
          school_id,
          student_id,
          academic_session_id,
          class_arm_id,
          status::text as status,
          starts_on::text as starts_on
      ),
      arrival_assignment as (
        insert into student_arrival_method_assignments (
          school_id,
          student_id,
          arrival_method,
          effective_from,
          effective_to,
          assigned_by_membership_id,
          assigned_by_internal_membership_id,
          reason,
          created_at,
          updated_at
        )
        select
          enrollment.school_id,
          enrollment.student_id,
          ${input.arrivalMethod},
          ${input.startsOn}::date,
          null,
          null,
          ${input.access.membership.id}::uuid,
          'CASA onboarding assignment',
          now(),
          now()
        from inserted_enrollment enrollment
        on conflict (
          school_id,
          student_id,
          effective_from
        ) do update set
          arrival_method =
            excluded.arrival_method,
          assigned_by_membership_id =
            null,
          assigned_by_internal_membership_id =
            excluded.assigned_by_internal_membership_id,
          reason =
            excluded.reason,
          updated_at = now()
        returning
          student_id,
          arrival_method::text
            as arrival_method
      )
      select
        enrollment.id,
        enrollment.student_id,
        enrollment.academic_session_id,
        enrollment.class_arm_id,
        ${input.branchId}::uuid
          as branch_id,
        enrollment.status,
        enrollment.starts_on,
        arrival.arrival_method
      from inserted_enrollment enrollment
      join arrival_assignment arrival
        on arrival.student_id =
           enrollment.student_id
    `);

  const enrollment =
    rowsOf<Record<
      string,
      unknown
    >>(result)[0];

  if (!enrollment) {
    return null;
  }

  await writeCasaInternalAudit({
    access:
      input.access,
    schoolId:
      input.access.school.id,
    action:
      "ONBOARDING_CLASS_ASSIGNED",
    subjectType:
      "STUDENT",
    subjectId:
      input.studentId,
    metadata: {
      enrollmentId:
        enrollment.id,
      branchId:
        input.branchId,
      classArmId:
        input.classArmId,
      academicSessionId:
        input.academicSessionId,
      arrivalMethod:
        input.arrivalMethod,
    },
  });

  return enrollment;
}

export async function acquireCasaOnboardingLock(
  input: {
    access:
      CasaInternalSchoolAccess;
    studentId: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      insert into casa_internal_onboarding_locks (
        school_id,
        student_id,
        membership_id,
        locked_at,
        expires_at
      )
      select
        ${input.access.school.id}::uuid,
        student.id,
        ${input.access.membership.id}::uuid,
        now(),
        now() + interval '15 minutes'
      from students
        student
      where
        student.school_id =
          ${input.access.school.id}::uuid
        and student.id =
          ${input.studentId}::uuid
      on conflict (
        school_id,
        student_id
      )
      do update set
        membership_id =
          excluded.membership_id,
        locked_at =
          excluded.locked_at,
        expires_at =
          excluded.expires_at
      where
        casa_internal_onboarding_locks.expires_at <=
          now()
        or casa_internal_onboarding_locks.membership_id =
          excluded.membership_id
      returning
        membership_id,
        locked_at,
        expires_at
    `);

  return (
    rowsOf<Record<
      string,
      unknown
    >>(
      result,
    )[0] ??
    null
  );
}

export async function releaseCasaOnboardingLock(
  input: {
    access:
      CasaInternalSchoolAccess;
    studentId: string;
  },
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      delete from casa_internal_onboarding_locks
      where
        school_id =
          ${input.access.school.id}::uuid
        and student_id =
          ${input.studentId}::uuid
        and (
          membership_id =
            ${input.access.membership.id}::uuid
          or ${input.access.membership.role} =
             'CASA_SUPER_ADMIN'
        )
      returning
        student_id
    `);

  return (
    rowsOf(result).length ===
    1
  );
}
