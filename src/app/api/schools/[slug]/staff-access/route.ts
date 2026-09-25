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
  });

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
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
      );

    const db =
      getDb();

    const staffRows =
      await db
        .select({
          membershipId:
            schoolMemberships.id,
          userId:
            users.id,
          fullName:
            users.fullName,
          email:
            users.email,
          membershipStatus:
            schoolMemberships.status,
          role:
            schoolMembershipRoles.role,
        })
        .from(
          schoolMemberships,
        )
        .innerJoin(
          users,
          eq(
            users.id,
            schoolMemberships
              .userId,
          ),
        )
        .innerJoin(
          schoolMembershipRoles,
          and(
            eq(
              schoolMembershipRoles
                .schoolId,
              schoolMemberships
                .schoolId,
            ),
            eq(
              schoolMembershipRoles
                .membershipId,
              schoolMemberships
                .id,
            ),
          ),
        )
        .where(
          and(
            eq(
              schoolMemberships
                .schoolId,
              access.school.id,
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
        )
        .orderBy(
          users.fullName,
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
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
      );

    const body =
      createSchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Enter a valid staff name, email and role.",
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
      body.data.role ===
        "ADMIN" &&
      !access.roles.includes(
        "OWNER",
      )
    ) {
      return NextResponse.json(
        {
          message:
            "Only the school Owner can create another Admin.",
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
          setup:
            delivery.setup,
          emailDelivery:
            delivery.emailDelivery,
          message:
            delivery.emailDelivery ===
              "SENT"
              ? "Staff access created. CASA emailed the required access link to the staff member."
              : "Staff access created. Email delivery did not complete; use the returned private fallback link where setup is required.",
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
        setup:
          delivery.setup,
        emailDelivery:
          delivery.emailDelivery,
        message:
          delivery.emailDelivery ===
            "SENT"
            ? "Staff account created. CASA emailed the private setup link to the staff member."
            : "Staff account created. Email delivery did not complete; use the returned private setup link as fallback.",
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
