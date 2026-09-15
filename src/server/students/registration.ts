import {
  neon,
} from "@neondatabase/serverless";

import {
  getDatabaseUrl,
} from "@/config/env";

export type StudentSex =
  | "MALE"
  | "FEMALE"
  | "UNSPECIFIED";

export interface StudentRegistrationInput {
  schoolId: string;
  branchId?:
    | string
    | null;
  admissionNumber?:
    | string
    | null;
  firstName: string;
  middleName?:
    | string
    | null;
  lastName: string;
  preferredName?:
    | string
    | null;
  dateOfBirth: string;
  sex: StudentSex;
  admissionDate: string;
}

export interface RegisteredStudent {
  id: string;
  casa_student_id: string;
  admission_number:
    | string
    | null;
  first_name: string;
  middle_name?:
    | string
    | null;
  last_name: string;
  status: string;
  home_branch_id:
    | string
    | null;
  home_branch_name?:
    | string
    | null;
}

export class StudentDuplicateError
  extends Error {
  constructor(
    public readonly existing:
      RegisteredStudent,
  ) {
    super(
      `This student already exists in this school as ${existing.casa_student_id}. Open the existing record instead of registering another copy.`,
    );
    this.name =
      "StudentDuplicateError";
  }
}

export class StudentCampusRequiredError
  extends Error {
  constructor() {
    super(
      "Select the student's campus before registering. This school has more than one active campus.",
    );
    this.name =
      "StudentCampusRequiredError";
  }
}

export class StudentCampusInvalidError
  extends Error {
  constructor() {
    super(
      "The selected campus is unavailable or does not belong to this school.",
    );
    this.name =
      "StudentCampusInvalidError";
  }
}

function normalized(
  value:
    | string
    | null
    | undefined,
) {
  return (
    value ?? ""
  )
    .trim()
    .toLowerCase();
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

async function resolveBranch(
  sqlClient:
    ReturnType<typeof neon>,
  input: {
    schoolId: string;
    requestedBranchId?:
      | string
      | null;
  },
) {
  const branches =
    rowsOf<{
      id: string;
      name: string;
      is_headquarters:
        boolean;
    }>(
      await sqlClient`
        select
          id,
          name,
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
      `,
    );

  if (
    input.requestedBranchId
  ) {
    const branch =
      branches.find(
        (candidate) =>
          candidate.id ===
          input.requestedBranchId,
      );

    if (!branch) {
      throw new StudentCampusInvalidError();
    }

    return branch;
  }

  if (
    branches.length === 1
  ) {
    return branches[0];
  }

  if (
    branches.length === 0
  ) {
    throw new StudentCampusInvalidError();
  }

  throw new StudentCampusRequiredError();
}

export async function registerStudentOnce(
  input:
    StudentRegistrationInput,
): Promise<RegisteredStudent> {
  const sqlClient =
    neon<boolean, boolean>(
      getDatabaseUrl(),
    );

  const branch =
    await resolveBranch(
      sqlClient,
      {
        schoolId:
          input.schoolId,
        requestedBranchId:
          input.branchId ??
          null,
      },
    );

  const admissionNumber =
    input.admissionNumber
      ?.trim()
      .toUpperCase() ||
    null;
  const firstName =
    input.firstName.trim();
  const middleName =
    input.middleName
      ?.trim() ||
    null;
  const lastName =
    input.lastName.trim();
  const preferredName =
    input.preferredName
      ?.trim() ||
    null;

  const naturalFingerprint =
    [
      "NATURAL",
      input.schoolId,
      normalized(
        firstName,
      ),
      normalized(
        middleName,
      ),
      normalized(
        lastName,
      ),
      input.dateOfBirth,
      input.sex,
    ].join("|");

  const admissionFingerprint =
    admissionNumber
      ? [
          "ADMISSION",
          input.schoolId,
          admissionNumber,
        ].join("|")
      : naturalFingerprint;

  const results =
    await sqlClient.transaction([
      sqlClient`
        select
          pg_advisory_xact_lock(
            hashtextextended(
              ${naturalFingerprint},
              0
            )
          ) as natural_locked,
          pg_advisory_xact_lock(
            hashtextextended(
              ${admissionFingerprint},
              0
            )
          ) as admission_locked
      `,
      sqlClient`
        insert into students (
          school_id,
          home_branch_id,
          admission_number,
          first_name,
          middle_name,
          last_name,
          preferred_name,
          date_of_birth,
          sex,
          status,
          admission_date,
          created_at,
          updated_at
        )
        select
          ${input.schoolId}::uuid,
          ${branch.id}::uuid,
          ${admissionNumber},
          ${firstName},
          ${middleName},
          ${lastName},
          ${preferredName},
          ${input.dateOfBirth}::date,
          ${input.sex}::student_sex,
          'ACTIVE'::student_status,
          ${input.admissionDate}::date,
          now(),
          now()
        where not exists (
          select 1
          from students existing
          where
            existing.school_id =
              ${input.schoolId}::uuid
            and (
              (
                ${admissionNumber}::text
                  is not null
                and existing.admission_number
                  is not null
                and upper(
                  trim(
                    existing.admission_number
                  )
                ) =
                  ${admissionNumber}
              )
              or (
                lower(
                  trim(
                    existing.first_name
                  )
                ) =
                  ${normalized(
                    firstName,
                  )}
                and lower(
                  trim(
                    coalesce(
                      existing.middle_name,
                      ''
                    )
                  )
                ) =
                  ${normalized(
                    middleName,
                  )}
                and lower(
                  trim(
                    existing.last_name
                  )
                ) =
                  ${normalized(
                    lastName,
                  )}
                and existing.date_of_birth =
                  ${input.dateOfBirth}::date
                and existing.sex =
                  ${input.sex}::student_sex
              )
            )
        )
        returning
          id,
          casa_student_id,
          admission_number,
          first_name,
          middle_name,
          last_name,
          status::text
            as status,
          home_branch_id
      `,
      sqlClient`
        select
          existing.id,
          existing.casa_student_id,
          existing.admission_number,
          existing.first_name,
          existing.middle_name,
          existing.last_name,
          existing.status::text
            as status,
          existing.home_branch_id,
          branch.name
            as home_branch_name
        from students existing
        left join school_branches
          branch
          on branch.school_id =
             existing.school_id
         and branch.id =
             existing.home_branch_id
        where
          existing.school_id =
            ${input.schoolId}::uuid
          and (
            (
              ${admissionNumber}::text
                is not null
              and existing.admission_number
                is not null
              and upper(
                trim(
                  existing.admission_number
                )
              ) =
                ${admissionNumber}
            )
            or (
              lower(
                trim(
                  existing.first_name
                )
              ) =
                ${normalized(
                  firstName,
                )}
              and lower(
                trim(
                  coalesce(
                    existing.middle_name,
                    ''
                  )
                )
              ) =
                ${normalized(
                  middleName,
                )}
              and lower(
                trim(
                  existing.last_name
                )
              ) =
                ${normalized(
                  lastName,
                )}
              and existing.date_of_birth =
                ${input.dateOfBirth}::date
              and existing.sex =
                ${input.sex}::student_sex
            )
          )
        order by
          existing.created_at asc
        limit 1
      `,
    ]);

  const inserted =
    rowsOf<RegisteredStudent>(
      results[1],
    )[0];

  if (inserted) {
    return {
      ...inserted,
      home_branch_name:
        branch.name,
    };
  }

  const duplicate =
    rowsOf<RegisteredStudent>(
      results[2],
    )[0];

  if (duplicate) {
    throw new StudentDuplicateError(
      duplicate,
    );
  }

  throw new Error(
    "STUDENT_REGISTRATION_FAILED",
  );
}
