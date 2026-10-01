import {
  NextResponse,
} from "next/server";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

export const dynamic =
  "force-dynamic";

function rowsOf<T>(
  value: unknown,
): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "rows" in value &&
    Array.isArray(
      (
        value as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      value as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  },
) {
  const {
    slug,
  } = await context.params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
      );
    const visibility =
      await listVisibleBranches(
        slug,
      );
    const db =
      getDb();

    const [
      sessions,
      branches,
      classArms,
    ] =
      await Promise.all([
        db.execute(sql`
          select
            id::text,
            name,
            starts_on::text,
            ends_on::text,
            status::text
          from academic_sessions
          where
            school_id =
              ${access.school.id}::uuid
          order by
            starts_on desc
        `),
        db.execute(sql`
          select
            id::text,
            name,
            code,
            is_headquarters
          from school_branches
          where
            school_id =
              ${access.school.id}::uuid
            and status =
              'ACTIVE'::school_branch_status
          order by
            is_headquarters desc,
            name asc
        `),
        db.execute(sql`
          select
            branch_map.branch_id::text,
            branch.name
              as branch_name,
            arm.id::text
              as class_arm_id,
            arm.name
              as class_arm_name,
            level.id::text
              as class_level_id,
            level.name
              as class_level_name,
            level.sort_order
              as class_level_sort_order,
            coalesce(
              section.sort_order,
              0
            ) as section_sort_order,
            section.name
              as section_name
          from school_branch_class_arms
            branch_map
          join school_branches branch
            on branch.school_id =
               branch_map.school_id
           and branch.id =
               branch_map.branch_id
           and branch.status =
               'ACTIVE'::school_branch_status
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
          left join school_sections section
            on section.school_id =
               level.school_id
           and section.id =
               level.section_id
          where
            branch_map.school_id =
              ${access.school.id}::uuid
          order by
            branch.name asc,
            coalesce(
              section.sort_order,
              0
            ) asc,
            level.sort_order asc,
            arm.name asc
        `),
      ]);

    const visibleIds =
      new Set(
        (
          visibility.branches as
            Array<{
              id: string;
            }>
        ).map(
          (branch) =>
            branch.id,
        ),
      );

    return NextResponse.json(
      {
        sessions:
          rowsOf(sessions),
        sourceBranches:
          rowsOf<{
            id: string;
          }>(
            branches,
          ).filter(
            (branch) =>
              visibleIds.has(
                branch.id,
              ),
          ),
        branches:
          rowsOf(branches),
        classArms:
          rowsOf(classArms),
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      AuthRequiredError
    ) {
      return NextResponse.json(
        {
          message:
            "Authentication required.",
        },
        {
          status: 401,
        },
      );
    }

    if (
      error instanceof
      SchoolAccessDeniedError
    ) {
      return NextResponse.json(
        {
          message:
            "Owner or Admin access is required.",
        },
        {
          status: 403,
        },
      );
    }

    throw error;
  }
}
