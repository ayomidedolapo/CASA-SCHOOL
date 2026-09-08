import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  and,
  eq,
  inArray,
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
  z.object({
    status:
      z.enum([
        "ACTIVE",
        "SUSPENDED",
      ]),
  });

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

    const identifiers =
      z.object({
        membershipId:
          z.string()
            .uuid(),
      }).safeParse({
        membershipId,
      });

    const body =
      bodySchema.safeParse(
        await request.json(),
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
      access.membership.id
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
            "Owner access cannot be suspended from Staff & Access.",
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
      ) &&
      !access.roles.includes(
        "OWNER",
      )
    ) {
      return NextResponse.json(
        {
          message:
            "Only the school Owner can suspend or reactivate an Admin.",
        },
        {
          status:
            403,
          headers:
            noStoreHeaders,
        },
      );
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
