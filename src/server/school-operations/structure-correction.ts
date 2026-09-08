import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";
import type {
  CasaInternalSchoolAccess,
} from "@/server/internal/authorization";

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

export async function correctBranchDetails(
  input: {
    access: SchoolAccess;
    branchId: string;
    name: string;
    code: string;
    address: string | null;
    reason: string;
  },
) {
  const db = getDb();

  try {
    const result =
      await db.execute(sql`
        with before_state as (
          select
            id,
            name,
            code,
            address,
            is_headquarters,
            status
          from school_branches
          where
            school_id =
              ${input.access.school.id}::uuid
            and id =
              ${input.branchId}::uuid
          for update
        ),
        corrected as (
          update school_branches branch
          set
            name = ${input.name},
            code =
              ${input.code.trim().toUpperCase()},
            address =
              ${input.address},
            updated_at = now()
          from before_state
          where
            branch.school_id =
              ${input.access.school.id}::uuid
            and branch.id =
              before_state.id
          returning
            branch.id,
            branch.name,
            branch.code,
            branch.address,
            branch.is_headquarters,
            branch.status
        ),
        audit as (
          insert into school_structure_change_events (
            school_id,
            branch_id,
            actor_kind,
            actor_school_membership_id,
            event_type,
            reason,
            before_snapshot,
            after_snapshot,
            created_at
          )
          select
            ${input.access.school.id}::uuid,
            corrected.id,
            'SCHOOL_MEMBERSHIP',
            ${input.access.membership.id}::uuid,
            'BRANCH_DETAILS_CORRECTED',
            ${input.reason.trim()},
            to_jsonb(before_state),
            to_jsonb(corrected),
            now()
          from corrected
          join before_state
            on before_state.id =
               corrected.id
          returning id
        )
        select
          corrected.*,
          audit.id as audit_event_id
        from corrected
        cross join audit
      `);

    const row =
      rowsOf(result)[0];

    if (!row) {
      throw new SchoolOperationsError(
        "Branch not found.",
        404,
        "BRANCH_NOT_FOUND",
      );
    }

    return row;
  } catch (error) {
    if (
      (error as {
        code?: string;
      })?.code === "23505"
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

interface RestructureBranchInput {
  name: string;
  code: string;
  address: string | null;
  classArmIds: string[];
}

export async function restructureStandaloneSchool(
  input: {
    access:
      CasaInternalSchoolAccess;
    headquarters: {
      name: string;
      code: string;
      address: string | null;
    };
    branches:
      RestructureBranchInput[];
    reason: string;
  },
) {
  const db = getDb();

  const normalizedBranches =
    input.branches.map(
      (branch) => ({
        ...branch,
        name:
          branch.name.trim(),
        code:
          branch.code
            .trim()
            .toUpperCase(),
        classArmIds:
          [
            ...new Set(
              branch.classArmIds,
            ),
          ],
      }),
    );

  const allCodes = [
    input.headquarters.code
      .trim()
      .toUpperCase(),
    ...normalizedBranches.map(
      (branch) =>
        branch.code,
    ),
  ];
  const allNames = [
    input.headquarters.name.trim()
      .toLowerCase(),
    ...normalizedBranches.map(
      (branch) =>
        branch.name.toLowerCase(),
    ),
  ];
  const allClassArmIds =
    normalizedBranches.flatMap(
      (branch) =>
        branch.classArmIds,
    );

  if (
    new Set(allCodes).size !==
      allCodes.length ||
    new Set(allNames).size !==
      allNames.length
  ) {
    throw new SchoolOperationsError(
      "Headquarters and new branches must have distinct names and codes.",
      400,
      "BRANCH_RESTRUCTURE_DUPLICATE",
    );
  }

  if (
    new Set(
      allClassArmIds,
    ).size !==
    allClassArmIds.length
  ) {
    throw new SchoolOperationsError(
      "A class arm can be assigned to only one new branch.",
      400,
      "BRANCH_RESTRUCTURE_CLASS_DUPLICATE",
    );
  }

  const baseline =
    await db.execute(sql`
      select
        branch.id,
        branch.name,
        branch.code,
        branch.address,
        branch.is_headquarters,
        branch.status,
        (
          select count(*)::int
          from school_branches all_branch
          where all_branch.school_id =
            ${input.access.school.id}::uuid
        ) as branch_count
      from school_branches branch
      where
        branch.school_id =
          ${input.access.school.id}::uuid
        and branch.is_headquarters = true
        and branch.status =
          'ACTIVE'::school_branch_status
      limit 1
    `);

  const base =
    rowsOf<{
      id: string;
      name: string;
      code: string;
      address: string | null;
      is_headquarters: boolean;
      status: string;
      branch_count: number;
    }>(
      baseline,
    )[0];

  if (
    !base ||
    Number(
      base.branch_count,
    ) !== 1
  ) {
    throw new SchoolOperationsError(
      "Standalone restructure requires exactly one existing branch and that branch must be the active headquarters.",
      409,
      "STANDALONE_STRUCTURE_REQUIRED",
    );
  }

  if (allClassArmIds.length) {
    const valid =
      await db.execute(sql`
        select
          arm.id
        from class_arms arm
        join class_levels level
          on level.school_id =
             arm.school_id
         and level.id =
             arm.class_level_id
        where
          arm.school_id =
            ${input.access.school.id}::uuid
          and arm.id =
            any(${allClassArmIds}::uuid[])
          and arm.is_active = true
          and level.is_active = true
      `);

    if (
      rowsOf(valid).length !==
      allClassArmIds.length
    ) {
      throw new SchoolOperationsError(
        "One or more class arms selected for restructure are invalid or inactive.",
        400,
        "INVALID_CLASS_ARM",
      );
    }
  }

  const branchJson =
    JSON.stringify(
      normalizedBranches.map(
        (branch) => ({
          name:
            branch.name,
          code:
            branch.code,
          address:
            branch.address,
        }),
      ),
    );
  const mappingJson =
    JSON.stringify(
      normalizedBranches.flatMap(
        (branch) =>
          branch.classArmIds.map(
            (classArmId) => ({
              branch_code:
                branch.code,
              class_arm_id:
                classArmId,
            }),
          ),
      ),
    );
  const beforeJson =
    JSON.stringify({
      headquarters: {
        id:
          base.id,
        name:
          base.name,
        code:
          base.code,
        address:
          base.address,
      },
      branchCount: 1,
    });

  try {
    const result =
      await db.execute(sql`
        with locked_hq as (
          select
            id
          from school_branches
          where
            school_id =
              ${input.access.school.id}::uuid
            and id =
              ${base.id}::uuid
            and is_headquarters = true
            and status =
              'ACTIVE'::school_branch_status
            and (
              select count(*)
              from school_branches sibling
              where sibling.school_id =
                ${input.access.school.id}::uuid
            ) = 1
          for update
        ),
        updated_hq as (
          update school_branches branch
          set
            name =
              ${input.headquarters.name.trim()},
            code =
              ${input.headquarters.code.trim().toUpperCase()},
            address =
              ${input.headquarters.address},
            updated_at = now()
          from locked_hq
          where branch.id =
            locked_hq.id
          returning
            branch.id,
            branch.name,
            branch.code,
            branch.address,
            branch.is_headquarters,
            branch.status
        ),
        branch_input as (
          select *
          from jsonb_to_recordset(
            ${branchJson}::jsonb
          ) as value(
            name text,
            code text,
            address text
          )
        ),
        created_branches as (
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
          select
            gen_random_uuid(),
            ${input.access.school.id}::uuid,
            value.name,
            value.code,
            false,
            'ACTIVE'::school_branch_status,
            value.address,
            now(),
            now()
          from branch_input value
          cross join updated_hq
          returning
            id,
            name,
            code,
            address,
            is_headquarters,
            status
        ),
        mapping_input as (
          select *
          from jsonb_to_recordset(
            ${mappingJson}::jsonb
          ) as value(
            branch_code text,
            class_arm_id uuid
          )
        ),
        removed_mappings as (
          delete from school_branch_class_arms mapping
          where
            mapping.school_id =
              ${input.access.school.id}::uuid
            and mapping.class_arm_id in (
              select
                class_arm_id
              from mapping_input
            )
          returning
            mapping.class_arm_id
        ),
        inserted_mappings as (
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
            branch.id,
            mapping.class_arm_id,
            now()
          from mapping_input mapping
          join created_branches branch
            on branch.code =
               mapping.branch_code
          cross join (
            select count(*)
            from removed_mappings
          ) dependency
          returning
            branch_id,
            class_arm_id
        ),
        affected_branches as (
          select id
          from updated_hq
          union
          select id
          from created_branches
        ),
        cleared_sections as (
          delete from school_branch_sections section_map
          where
            section_map.school_id =
              ${input.access.school.id}::uuid
            and section_map.branch_id in (
              select id
              from affected_branches
            )
          returning section_map.id
        ),
        new_branch_sections as (
          insert into school_branch_sections (
            id,
            school_id,
            branch_id,
            section_id,
            created_at
          )
          select distinct
            gen_random_uuid(),
            ${input.access.school.id}::uuid,
            inserted.branch_id,
            level.section_id,
            now()
          from inserted_mappings inserted
          join class_arms arm
            on arm.school_id =
               ${input.access.school.id}::uuid
           and arm.id =
               inserted.class_arm_id
          join class_levels level
            on level.school_id =
               arm.school_id
           and level.id =
               arm.class_level_id
          cross join (
            select count(*)
            from cleared_sections
          ) dependency
          where level.section_id is not null
          on conflict do nothing
          returning id
        ),
        hq_sections as (
          insert into school_branch_sections (
            id,
            school_id,
            branch_id,
            section_id,
            created_at
          )
          select distinct
            gen_random_uuid(),
            ${input.access.school.id}::uuid,
            updated_hq.id,
            level.section_id,
            now()
          from updated_hq
          join school_branch_class_arms mapping
            on mapping.school_id =
               ${input.access.school.id}::uuid
           and mapping.branch_id =
               updated_hq.id
           and mapping.class_arm_id not in (
             select
               class_arm_id
             from mapping_input
           )
          join class_arms arm
            on arm.school_id =
               mapping.school_id
           and arm.id =
               mapping.class_arm_id
          join class_levels level
            on level.school_id =
               arm.school_id
           and level.id =
               arm.class_level_id
          where level.section_id is not null
          on conflict do nothing
          returning id
        ),
        after_state as (
          select jsonb_build_object(
            'headquarters',
            (
              select to_jsonb(updated_hq)
              from updated_hq
            ),
            'createdBranches',
            coalesce(
              (
                select jsonb_agg(
                  to_jsonb(created_branches)
                  order by created_branches.name
                )
                from created_branches
              ),
              '[]'::jsonb
            ),
            'movedClassArmCount',
            (
              select count(*)
              from inserted_mappings
            )
          ) as snapshot
        ),
        audit as (
          insert into school_structure_change_events (
            school_id,
            branch_id,
            actor_kind,
            actor_casa_membership_id,
            event_type,
            reason,
            before_snapshot,
            after_snapshot,
            created_at
          )
          select
            ${input.access.school.id}::uuid,
            updated_hq.id,
            'CASA_INTERNAL',
            ${input.access.membership.id}::uuid,
            'STANDALONE_TO_MULTI_BRANCH_RESTRUCTURE',
            ${input.reason.trim()},
            ${beforeJson}::jsonb,
            after_state.snapshot,
            now()
          from updated_hq
          cross join after_state
          returning id
        ),
        internal_audit as (
          insert into casa_internal_audit_logs (
            actor_membership_id,
            school_id,
            action,
            subject_type,
            subject_id,
            metadata,
            created_at
          )
          select
            ${input.access.membership.id}::uuid,
            ${input.access.school.id}::uuid,
            'ORGANIZATION_RESTRUCTURE',
            'SCHOOL',
            ${input.access.school.id}::uuid,
            jsonb_build_object(
              'structureEventId',
              audit.id,
              'reason',
              ${input.reason.trim()}
            ),
            now()
          from audit
          returning id
        )
        select
          updated_hq.id
            as headquarters_id,
          updated_hq.name
            as headquarters_name,
          (
            select count(*)::int
            from created_branches
          ) as created_branch_count,
          (
            select count(*)::int
            from inserted_mappings
          ) as moved_class_arm_count,
          audit.id
            as audit_event_id,
          internal_audit.id
            as internal_audit_id
        from updated_hq
        cross join audit
        cross join internal_audit
      `);

    const row =
      rowsOf(result)[0];

    if (!row) {
      throw new SchoolOperationsError(
        "Standalone structure changed before the restructure could be completed.",
        409,
        "STRUCTURE_STATE_CHANGED",
      );
    }

    return row;
  } catch (error) {
    if (
      (error as {
        code?: string;
      })?.code === "23505"
    ) {
      throw new SchoolOperationsError(
        "The requested restructure conflicts with an existing branch name or code.",
        409,
        "BRANCH_CONFLICT",
      );
    }

    throw error;
  }
}
