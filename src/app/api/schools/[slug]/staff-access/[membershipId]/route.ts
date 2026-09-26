import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  and,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import {
  z,
} from "zod";

import {
  getDb,
} from "@/db";
import {
  schoolMembershipRoles,
  schoolMemberships,
} from "@/db/schema";
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

const noStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

interface RouteContext {
  params:
    Promise<{
      slug:
        string;
      membershipId:
        string;
    }>;
}

const bodySchema =
  z.discriminatedUnion(
    "action",
    [
      z.object({
        action:
          z.literal(
            "SET_STATUS",
          ),
        status:
          z.enum([
            "ACTIVE",
            "SUSPENDED",
          ]),
      }),
      z.object({
        action:
          z.literal(
            "ASSIGN_BRANCH",
          ),
        branchId:
          z.string()
            .uuid(),
      }),
    ],
  );

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

function authErrorResponse(
  error:
    unknown,
) {
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
        status:
          401,
        headers:
          noStoreHeaders,
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
          "Owner or Admin access required.",
      },
      {
        status:
          403,
        headers:
          noStoreHeaders,
      },
    );
  }

  return null;
}

export async function PATCH(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
    membershipId,
  } =
    await context.params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
      );
    const scope =
      await listVisibleBranches(
        slug,
      );
    const visibleBranches =
      scope.branches as
        Array<{
          id: string;
          name: string;
        }>;

    const identifiers =
      z.object({
        membershipId:
          z.string()
            .uuid(),
      }).safeParse({
        membershipId,
      });

    const rawBody =
      await request.json();
    const normalizedBody =
      "action" in
        (
          rawBody as
            Record<
              string,
              unknown
            >
        )
        ? rawBody
        : {
            action:
              "SET_STATUS",
            ...(
              rawBody as
                Record<
                  string,
                  unknown
                >
            ),
          };

    const body =
      bodySchema.safeParse(
        normalizedBody,
      );

    if (
      !identifiers.success ||
      !body.success
    ) {
      return NextResponse.json(
        {
          message:
            "Invalid staff access update.",
        },
        {
          status:
            400,
          headers:
            noStoreHeaders,
        },
      );
    }

    if (
      membershipId ===
      access.membership.id &&
      body.data.action ===
        "SET_STATUS"
    ) {
      return NextResponse.json(
        {
          message:
            "You cannot suspend your own current school membership from this screen.",
        },
        {
          status:
            409,
          headers:
            noStoreHeaders,
        },
      );
    }

    const db =
      getDb();

    const [
      membershipRows,
      roleRows,
    ] =
      await db.batch([
        db
          .select({
            id:
              schoolMemberships
                .id,
            status:
              schoolMemberships
                .status,
          })
          .from(
            schoolMemberships,
          )
          .where(
            and(
              eq(
                schoolMemberships
                  .schoolId,
                access.school.id,
              ),
              eq(
                schoolMemberships
                  .id,
                membershipId,
              ),
            ),
          )
          .limit(
            1,
          ),
        db
          .select({
            role:
              schoolMembershipRoles
                .role,
          })
          .from(
            schoolMembershipRoles,
          )
          .where(
            and(
              eq(
                schoolMembershipRoles
                  .schoolId,
                access.school.id,
              ),
              eq(
                schoolMembershipRoles
                  .membershipId,
                membershipId,
              ),
              inArray(
                schoolMembershipRoles
                  .role,
                [
                  "OWNER",
                  "ADMIN",
                  "STAFF",
                  "SCHOOL_TECHNICIAN",
                ],
              ),
            ),
          ),
      ]);

    if (
      !membershipRows[0]
    ) {
      return NextResponse.json(
        {
          message:
            "Staff membership not found.",
        },
        {
          status:
            404,
          headers:
            noStoreHeaders,
        },
      );
    }

    const roles =
      roleRows.map(
        (
          row,
        ) =>
          row.role,
      );

    if (
      roles.includes(
        "OWNER",
      )
    ) {
      return NextResponse.json(
        {
          message:
            "Owner access cannot be changed from Staff & Access.",
        },
        {
          status:
            403,
          headers:
            noStoreHeaders,
        },
      );
    }

    if (
      roles.includes(
        "ADMIN",
      )
    ) {
      if (
        !access.roles.includes(
          "OWNER",
        ) ||
        !scope.organizationAdmin
      ) {
        return NextResponse.json(
          {
            message:
              "Only the school Owner can change an organization Admin.",
          },
          {
            status:
              403,
            headers:
              noStoreHeaders,
          },
        );
      }

      if (
        body.data.action ===
          "ASSIGN_BRANCH"
      ) {
        return NextResponse.json(
          {
            message:
              "Organization Admin access is not assigned through the staff campus table.",
          },
          {
            status:
              409,
            headers:
              noStoreHeaders,
          },
        );
      }
    }

    const branchRoles =
      roles.some(
        (role) =>
          role ===
            "STAFF" ||
          role ===
            "SCHOOL_TECHNICIAN",
      );

    if (
      body.data.action ===
        "ASSIGN_BRANCH"
    ) {
      if (!branchRoles) {
        return NextResponse.json(
          {
            message:
              "This account is not a branch staff or technician account.",
          },
          {
            status:
              409,
            headers:
              noStoreHeaders,
          },
        );
      }

      const branchId =
        body.data.branchId;
      const branch =
        visibleBranches.find(
          (candidate) =>
            candidate.id ===
            branchId,
        );

      if (!branch) {
        return NextResponse.json(
          {
            message:
              "Select a campus within your Staff & Access scope.",
          },
          {
            status:
              403,
            headers:
              noStoreHeaders,
          },
        );
      }

      await db.execute(sql`
        insert into school_branch_staff_assignments (
          id,
          school_id,
          branch_id,
          membership_id,
          is_active,
          assigned_by_membership_id,
          created_at,
          updated_at
        )
        values (
          gen_random_uuid(),
          ${access.school.id}::uuid,
          ${branch.id}::uuid,
          ${membershipId}::uuid,
          true,
          ${access.membership.id}::uuid,
          now(),
          now()
        )
        on conflict (
          school_id,
          branch_id,
          membership_id
        )
        do update set
          is_active = true,
          assigned_by_membership_id =
            excluded.assigned_by_membership_id,
          updated_at = now()
      `);

      return NextResponse.json(
        {
          updated:
            true,
          membershipId,
          branch: {
            id:
              branch.id,
            name:
              branch.name,
          },
        },
        {
          headers:
            noStoreHeaders,
        },
      );
    }

    if (branchRoles) {
      const scoped =
        rowsOf<{
          id: string;
        }>(
          await db.execute(sql`
            select assignment.id::text as id
            from school_branch_staff_assignments assignment
            where
              assignment.school_id =
                ${access.school.id}::uuid
              and assignment.membership_id =
                ${membershipId}::uuid
              and assignment.is_active =
                true
              and assignment.branch_id in (
                ${sql.join(
                  visibleBranches.map(
                    (branch) =>
                      sql`${branch.id}::uuid`,
                  ),
                  sql`, `,
                )}
              )
            limit 1
          `),
        );

      const anyAssignment =
        rowsOf<{
          id: string;
        }>(
          await db.execute(sql`
            select id::text as id
            from school_branch_staff_assignments
            where
              school_id =
                ${access.school.id}::uuid
              and membership_id =
                ${membershipId}::uuid
              and is_active =
                true
            limit 1
          `),
        );

      if (
        scoped.length ===
          0 &&
        !(
          scope.organizationAdmin &&
          anyAssignment.length ===
            0
        )
      ) {
        return NextResponse.json(
          {
            message:
              "That staff member belongs to another campus.",
          },
          {
            status:
              403,
            headers:
              noStoreHeaders,
          },
        );
      }
    }

    await db
      .update(
        schoolMemberships,
      )
      .set({
        status:
          body.data.status,
        updatedAt:
          new Date(),
      })
      .where(
        and(
          eq(
            schoolMemberships
              .schoolId,
            access.school.id,
          ),
          eq(
            schoolMemberships
              .id,
            membershipId,
          ),
        ),
      );

    return NextResponse.json(
      {
        updated:
          true,
        membershipId,
        status:
          body.data.status,
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      authErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}
