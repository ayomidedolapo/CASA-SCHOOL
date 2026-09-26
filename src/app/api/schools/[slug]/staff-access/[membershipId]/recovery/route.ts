import {
  createHash,
  randomBytes,
} from "node:crypto";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  sql,
} from "drizzle-orm";

import {
  getDb,
} from "@/db";
import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  sendAccountAccessEmail,
} from "@/server/messaging/account-access-email";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

export const dynamic =
  "force-dynamic";

const noStore = {
  "Cache-Control":
    "no-store",
};

function rowsOf<T>(
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
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

export async function POST(
  request:
    NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        slug: string;
        membershipId:
          string;
      }>;
  },
) {
  const {
    slug,
    membershipId,
  } =
    await params;

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
        }>;
    const db =
      getDb();

    const target =
      rowsOf<{
        user_id: string;
        full_name: string;
        email:
          string | null;
        roles: string[];
      }>(
        await db.execute(sql`
          select
            membership.user_id,
            user_account.full_name,
            user_account.email,
            coalesce(
              array_agg(
                role.role::text
              ) filter(
                where
                  role.role is not null
              ),
              array[]::text[]
            ) roles
          from school_memberships membership
          join users user_account
            on user_account.id =
               membership.user_id
          left join school_membership_roles role
            on role.school_id =
               membership.school_id
           and role.membership_id =
               membership.id
          where
            membership.school_id =
              ${access.school.id}::uuid
            and membership.id =
              ${membershipId}::uuid
            and membership.status =
              'ACTIVE'
          group by
            membership.user_id,
            user_account.full_name,
            user_account.email
          limit 1
        `),
      )[0];

    if (!target) {
      return NextResponse.json(
        {
          message:
            "Active school account not found.",
        },
        {
          status: 404,
          headers:
            noStore,
        },
      );
    }

    if (
      target.roles.includes(
        "OWNER",
      )
    ) {
      return NextResponse.json(
        {
          message:
            "School Owner password recovery is controlled by CASA Super Admin.",
        },
        {
          status: 403,
          headers:
            noStore,
        },
      );
    }

    if (
      target.roles.includes(
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
              "Only the School Owner can create a recovery link for an organization Admin.",
          },
          {
            status: 403,
            headers:
              noStore,
          },
        );
      }
    } else if (
      target.roles.includes(
        "STAFF",
      ) ||
      target.roles.includes(
        "SCHOOL_TECHNICIAN",
      )
    ) {
      const scoped =
        visibleBranches.length ===
          0
          ? []
          : rowsOf<{
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
            status: 403,
            headers:
              noStore,
          },
        );
      }
    }

    const raw =
      randomBytes(32)
        .toString(
          "base64url",
        );
    const hash =
      createHash(
        "sha256",
      )
        .update(
          raw,
        )
        .digest(
          "hex",
        );
    const expiresAt =
      new Date(
        Date.now() +
          24 * 60 * 60 *
            1000,
      );

    await db.execute(sql`
      update casa_account_setup_tokens
      set used_at = now()
      where
        user_id =
          ${target.user_id}::uuid
        and used_at is null
    `);

    await db.execute(sql`
      insert into casa_account_setup_tokens(
        user_id,
        token_hash,
        purpose,
        created_by_internal_membership_id,
        expires_at
      )
      values(
        ${target.user_id}::uuid,
        ${hash},
        'SCHOOL_OWNER',
        null,
        ${expiresAt.toISOString()}::timestamptz
      )
    `);

    const origin =
      new URL(
        request.url,
      ).origin;
    const setupUrl =
      `${origin}/account/setup?token=${encodeURIComponent(
        raw,
      )}`;

    const emailDelivery =
      await sendAccountAccessEmail({
        email:
          target.email,
        recipientName:
          target.full_name,
        organizationName:
          access.school.name,
        actionLabel:
          "Recover CASA password",
        actionUrl:
          setupUrl,
        expiresAt,
        context:
          `${access.school.name} created a private CASA password recovery link for your school account.`,
      });

    return NextResponse.json(
      {
        emailDelivery,
        setup: {
          url:
            setupUrl,
          expiresAt:
            expiresAt.toISOString(),
        },
      },
      {
        headers:
          noStore,
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
          headers:
            noStore,
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
          status: 403,
          headers:
            noStore,
        },
      );
    }

    console.error(
      "School password recovery link failed",
      error,
    );

    return NextResponse.json(
      {
        message:
          "Recovery link could not be created.",
      },
      {
        status: 500,
        headers:
          noStore,
      },
    );
  }
}
