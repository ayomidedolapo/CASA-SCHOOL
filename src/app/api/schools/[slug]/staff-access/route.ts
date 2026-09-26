import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  and,
  eq,
  inArray,
  isNull,
  sql,
} from "drizzle-orm";
import {
  z,
} from "zod";

import {
  getDb,
} from "@/db";
import {
  authPasskeys,
  authPasswordCredentials,
  schoolMembershipRoles,
  schoolMemberships,
  users,
} from "@/db/schema";
import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  hashPassword,
} from "@/server/auth/password";
import {
  sendAccountAccessEmail,
} from "@/server/messaging/account-access-email";
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
    }>;
}

const createSchema =
  z.object({
    fullName:
      z.string()
        .trim()
        .min(2)
        .max(200),
    email:
      z.string()
        .trim()
        .email()
        .max(320),
    role:
      z.enum([
        "ADMIN",
        "STAFF",
        "SCHOOL_TECHNICIAN",
      ]),
    branchId:
      z.string()
        .uuid(),
  });

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

type VisibleBranch = {
  id: string;
  name: string;
  code: string;
  is_headquarters: boolean;
};

async function resolveStaffScope(
  slug: string,
) {
  const access =
    await requireSchoolRole(
      slug,
      [
        "OWNER",
        "ADMIN",
      ],
    );
  const visible =
    await listVisibleBranches(
      slug,
    );

  if (
    visible.organizationAdmin
  ) {
    const result =
      await getDb().execute(sql`
        select
          id,
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
      `);

    return {
      access,
      organizationAdmin:
        true,
      branches:
        rowsOf<VisibleBranch>(
          result,
        ),
    };
  }

  return {
    access,
    organizationAdmin:
      false,
    branches:
      visible.branches as
        VisibleBranch[],
  };
}

async function assignMembershipToBranch(
  input: {
    schoolId: string;
    branchId: string;
    membershipId: string;
    assignedByMembershipId: string;
  },
) {
  await getDb().execute(sql`
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
      ${input.schoolId}::uuid,
      ${input.branchId}::uuid,
      ${input.membershipId}::uuid,
      true,
      ${input.assignedByMembershipId}::uuid,
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
}

async function deliverSchoolStaffAccess(
  input: {
    db:
      ReturnType<
        typeof getDb
      >;
    request:
      NextRequest;
    userId:
      string;
    fullName:
      string;
    email:
      string;
    schoolName:
      string;
    needsSetup:
      boolean;
  },
) {
  const origin =
    new URL(
      input.request.url,
    ).origin;
  let setup:
    {
      url:
        string;
      expiresAt:
        string;
    } |
    null =
      null;

  if (
    input.needsSetup
  ) {
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

    await input.db.execute(sql`
      update casa_account_setup_tokens
      set used_at = now()
      where
        user_id =
          ${input.userId}::uuid
        and used_at is null
    `);

    await input.db.execute(sql`
      insert into casa_account_setup_tokens(
        user_id,
        token_hash,
        purpose,
        created_by_internal_membership_id,
        expires_at
      )
      values(
        ${input.userId}::uuid,
        ${hash},
        'SCHOOL_OWNER',
        null,
        ${expiresAt.toISOString()}::timestamptz
      )
    `);

    setup = {
      url:
        `${origin}/account/setup?token=${encodeURIComponent(
          raw,
        )}`,
      expiresAt:
        expiresAt.toISOString(),
    };
  }

  const emailDelivery =
    await sendAccountAccessEmail({
      email:
        input.email,
      recipientName:
        input.fullName,
      organizationName:
        input.schoolName,
      actionLabel:
        setup
          ? "Set up CASA access"
          : "Sign in to CASA",
      actionUrl:
        setup?.url ??
        `${origin}/login`,
      expiresAt:
        setup?.expiresAt ??
        null,
      context:
        setup
          ? `${input.schoolName} created CASA access for you. Use the private link below to choose your password.`
          : `${input.schoolName} granted you CASA access. Sign in with your existing CASA credentials.`,
    });

  return {
    setup,
    emailDelivery,
  };
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
          "Only the school Owner or an Admin can manage Staff & Access.",
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

export async function GET(
  _request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const scope =
      await resolveStaffScope(
        slug,
      );
    const access =
      scope.access;
    const branchIds =
      scope.branches.map(
        (branch) =>
          branch.id,
      );
    const db =
      getDb();

    const staffRows =
      branchIds.length ===
        0
        ? []
        : rowsOf<{
            membershipId: string;
            userId: string;
            fullName: string;
            email:
              string | null;
            membershipStatus:
              string;
            role: string;
            branchId:
              string | null;
            branchName:
              string | null;
            legacyUnassigned:
              boolean;
          }>(
            await db.execute(sql`
              select
                membership.id::text
                  as "membershipId",
                user_account.id::text
                  as "userId",
                user_account.full_name
                  as "fullName",
                user_account.email
                  as email,
                membership.status::text
                  as "membershipStatus",
                role.role::text
                  as role,
                coalesce(
                  staff_assignment.branch_id,
                  admin_assignment.branch_id
                )::text
                  as "branchId",
                coalesce(
                  staff_branch.name,
                  admin_branch.name
                ) as "branchName",
                (
                  role.role in (
                    'STAFF'::school_membership_role,
                    'SCHOOL_TECHNICIAN'::school_membership_role
                  )
                  and staff_assignment.id is null
                ) as "legacyUnassigned"
              from school_memberships membership
              join users user_account
                on user_account.id =
                   membership.user_id
              join school_membership_roles role
                on role.school_id =
                   membership.school_id
               and role.membership_id =
                   membership.id
              left join school_branch_staff_assignments
                staff_assignment
                on staff_assignment.school_id =
                   membership.school_id
               and staff_assignment.membership_id =
                   membership.id
               and staff_assignment.is_active =
                   true
              left join school_branches staff_branch
                on staff_branch.school_id =
                   staff_assignment.school_id
               and staff_branch.id =
                   staff_assignment.branch_id
              left join school_branch_admin_assignments
                admin_assignment
                on admin_assignment.school_id =
                   membership.school_id
               and admin_assignment.membership_id =
                   membership.id
               and admin_assignment.is_active =
                   true
              left join school_branches admin_branch
                on admin_branch.school_id =
                   admin_assignment.school_id
               and admin_branch.id =
                   admin_assignment.branch_id
              where
                membership.school_id =
                  ${access.school.id}::uuid
                and role.role in (
                  'OWNER'::school_membership_role,
                  'ADMIN'::school_membership_role,
                  'STAFF'::school_membership_role,
                  'SCHOOL_TECHNICIAN'::school_membership_role
                )
                and (
                  (
                    role.role in (
                      'STAFF'::school_membership_role,
                      'SCHOOL_TECHNICIAN'::school_membership_role
                    )
                    and staff_assignment.branch_id in (
                      ${sql.join(
                        branchIds.map(
                          (branchId) =>
                            sql`${branchId}::uuid`,
                        ),
                        sql`, `,
                      )}
                    )
                  )
                  or (
                    role.role =
                      'ADMIN'::school_membership_role
                    and admin_assignment.branch_id in (
                      ${sql.join(
                        branchIds.map(
                          (branchId) =>
                            sql`${branchId}::uuid`,
                        ),
                        sql`, `,
                      )}
                    )
                  )
                  or (
                    ${scope.organizationAdmin}
                    and role.role =
                      'OWNER'::school_membership_role
                  )
                  or (
                    ${scope.organizationAdmin}
                    and role.role =
                      'ADMIN'::school_membership_role
                    and admin_assignment.id is null
                  )
                  or (
                    ${scope.organizationAdmin}
                    and role.role in (
                      'STAFF'::school_membership_role,
                      'SCHOOL_TECHNICIAN'::school_membership_role
                    )
                    and staff_assignment.id is null
                  )
                )
              order by
                user_account.full_name,
                role.role,
                coalesce(
                  staff_branch.name,
                  admin_branch.name,
                  ''
                )
            `),
          );

    const userIds =
      [
        ...new Set(
          staffRows.map(
            (
              row,
            ) =>
              row.userId,
          ),
        ),
      ];

    const passkeyRows =
      userIds.length >
      0
        ? await db
            .select({
              userId:
                authPasskeys
                  .userId,
            })
            .from(
              authPasskeys,
            )
            .where(
              and(
                inArray(
                  authPasskeys
                    .userId,
                  userIds,
                ),
                isNull(
                  authPasskeys
                    .revokedAt,
                ),
              ),
            )
        : [];

    const passkeyCounts =
      new Map<
        string,
        number
      >();

    for (
      const row of
      passkeyRows
    ) {
      passkeyCounts.set(
        row.userId,
        (
          passkeyCounts.get(
            row.userId,
          ) ??
          0
        ) +
          1,
      );
    }

    return NextResponse.json(
      {
        staff:
          staffRows.map(
            (
              row,
            ) => ({
              ...row,
              activePasskeys:
                passkeyCounts.get(
                  row.userId,
                ) ??
                0,
            }),
          ),
        branches:
          scope.branches.map(
            (branch) => ({
              id:
                branch.id,
              name:
                branch.name,
              code:
                branch.code,
              isHeadquarters:
                branch.is_headquarters,
            }),
          ),
        organizationAdmin:
          scope.organizationAdmin,
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

export async function POST(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const scope =
      await resolveStaffScope(
        slug,
      );
    const access =
      scope.access;

    const body =
      createSchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Enter a valid staff name, email, role and campus.",
        },
        {
          status:
            400,
          headers:
            noStoreHeaders,
        },
      );
    }

    const branch =
      scope.branches.find(
        (candidate) =>
          candidate.id ===
          body.data.branchId,
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

    if (
      body.data.role ===
        "ADMIN" &&
      (
        !access.roles.includes(
          "OWNER",
        ) ||
        !scope.organizationAdmin
      )
    ) {
      return NextResponse.json(
        {
          message:
            "Only the school Owner can create another organization Admin.",
        },
        {
          status:
            403,
          headers:
            noStoreHeaders,
        },
      );
    }

    const email =
      body.data.email
        .trim()
        .toLowerCase();

    const db =
      getDb();

    const existingUsers =
      await db
        .select({
          id:
            users.id,
          fullName:
            users.fullName,
          status:
            users.status,
        })
        .from(
          users,
        )
        .where(
          eq(
            users.email,
            email,
          ),
        )
        .limit(
          1,
        );

    const existingUser =
      existingUsers[0];

    if (existingUser) {
      if (
        existingUser.status !==
        "ACTIVE"
      ) {
        return NextResponse.json(
          {
            message:
              "That CASA identity exists but is not ACTIVE. Resolve the account status before adding school access.",
          },
          {
            status:
              409,
            headers:
              noStoreHeaders,
          },
        );
      }

      const [
        memberships,
        passwordRows,
        passkeyRows,
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
                    .userId,
                  existingUser.id,
                ),
              ),
            )
            .limit(
              1,
            ),
          db
            .select({
              userId:
                authPasswordCredentials
                  .userId,
            })
            .from(
              authPasswordCredentials,
            )
            .where(
              eq(
                authPasswordCredentials
                  .userId,
                existingUser.id,
              ),
            )
            .limit(
              1,
            ),
          db
            .select({
              id:
                authPasskeys.id,
            })
            .from(
              authPasskeys,
            )
            .where(
              and(
                eq(
                  authPasskeys
                    .userId,
                  existingUser.id,
                ),
                isNull(
                  authPasskeys
                    .revokedAt,
                ),
              ),
            )
            .limit(
              1,
            ),
        ]);

      const membership =
        memberships[0];

      if (
        membership &&
        membership.status !==
        "ACTIVE"
      ) {
        return NextResponse.json(
          {
            message:
              "This person's existing school membership is not ACTIVE. Reactivate it deliberately before adding roles.",
          },
          {
            status:
              409,
            headers:
              noStoreHeaders,
          },
        );
      }

      const membershipId =
        membership?.id ??
        randomUUID();

      const needsMembership =
        !membership;

      const needsCredential =
        !passwordRows[0] &&
        !passkeyRows[0];

      const temporaryPassword =
        needsCredential
          ? `Casa-${randomBytes(
              18,
            ).toString(
              "base64url",
            )}!`
          : null;

      const passwordHash =
        temporaryPassword
          ? await hashPassword(
              temporaryPassword,
            )
          : null;

      const membershipInsert =
        db
          .insert(
            schoolMemberships,
          )
          .values({
            id:
              membershipId,
            schoolId:
              access.school.id,
            userId:
              existingUser.id,
            status:
              "ACTIVE",
            joinedAt:
              new Date(),
          });

      const roleInsert =
        db
          .insert(
            schoolMembershipRoles,
          )
          .values({
            schoolId:
              access.school.id,
            membershipId,
            role:
              body.data.role,
          })
          .onConflictDoNothing();

      const passwordInsert =
        passwordHash
          ? db
              .insert(
                authPasswordCredentials,
              )
              .values({
                userId:
                  existingUser.id,
                passwordHash,
                mustChangePassword:
                  true,
              })
          : null;

      if (
        needsMembership &&
        passwordInsert
      ) {
        await db.batch([
          membershipInsert,
          roleInsert,
          passwordInsert,
        ]);
      } else if (
        needsMembership
      ) {
        await db.batch([
          membershipInsert,
          roleInsert,
        ]);
      } else if (
        passwordInsert
      ) {
        await db.batch([
          roleInsert,
          passwordInsert,
        ]);
      } else {
        await roleInsert;
      }

      if (
        body.data.role !==
        "ADMIN"
      ) {
        await assignMembershipToBranch({
          schoolId:
            access.school.id,
          branchId:
            branch.id,
          membershipId,
          assignedByMembershipId:
            access.membership.id,
        });
      }

      const delivery =
        await deliverSchoolStaffAccess({
          db,
          request,
          userId:
            existingUser.id,
          fullName:
            existingUser.fullName,
          email,
          schoolName:
            access.school.name,
          needsSetup:
            Boolean(
              temporaryPassword,
            ),
        });

      return NextResponse.json(
        {
          created:
            true,
          reusedIdentity:
            true,
          temporaryPassword:
            null,
          membershipId,
          userId:
            existingUser.id,
          branch: {
            id:
              branch.id,
            name:
              branch.name,
          },
          setup:
            delivery.setup,
          emailDelivery:
            delivery.emailDelivery,
          message:
            delivery.emailDelivery ===
              "SENT"
              ? `Staff access created for ${branch.name}. CASA emailed the required access link.`
              : `Staff access created for ${branch.name}. Email delivery did not complete; use the private fallback link where setup is required.`,
        },
        {
          status:
            201,
          headers:
            noStoreHeaders,
        },
      );
    }

    const temporaryPassword =
      `Casa-${randomBytes(
        18,
      ).toString(
        "base64url",
      )}!`;

    const passwordHash =
      await hashPassword(
        temporaryPassword,
      );

    const userId =
      randomUUID();

    const membershipId =
      randomUUID();

    const roleId =
      randomUUID();

    await db.batch([
      db
        .insert(
          users,
        )
        .values({
          id:
            userId,
          fullName:
            body.data
              .fullName,
          email,
          status:
            "ACTIVE",
        }),
      db
        .insert(
          schoolMemberships,
        )
        .values({
          id:
            membershipId,
          schoolId:
            access.school.id,
          userId,
          status:
            "ACTIVE",
          joinedAt:
            new Date(),
        }),
      db
        .insert(
          schoolMembershipRoles,
        )
        .values({
          id:
            roleId,
          schoolId:
            access.school.id,
          membershipId,
          role:
            body.data.role,
        }),
      db
        .insert(
          authPasswordCredentials,
        )
        .values({
          userId,
          passwordHash,
          mustChangePassword:
            true,
        }),
    ]);

    if (
      body.data.role !==
      "ADMIN"
    ) {
      await assignMembershipToBranch({
        schoolId:
          access.school.id,
        branchId:
          branch.id,
        membershipId,
        assignedByMembershipId:
          access.membership.id,
      });
    }

    const delivery =
      await deliverSchoolStaffAccess({
        db,
        request,
        userId,
        fullName:
          body.data.fullName,
        email,
        schoolName:
          access.school.name,
        needsSetup:
          true,
      });

    return NextResponse.json(
      {
        created:
          true,
        reusedIdentity:
          false,
        temporaryPassword:
          null,
        membershipId,
        userId,
        branch: {
          id:
            branch.id,
          name:
            branch.name,
        },
        setup:
          delivery.setup,
        emailDelivery:
          delivery.emailDelivery,
        message:
          delivery.emailDelivery ===
            "SENT"
            ? `Staff account created for ${branch.name}. CASA emailed the private setup link.`
            : `Staff account created for ${branch.name}. Email delivery did not complete; use the returned private setup link as fallback.`,
      },
      {
        status:
          201,
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
