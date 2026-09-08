import {
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

      return NextResponse.json(
        {
          created:
            true,
          reusedIdentity:
            true,
          temporaryPassword,
          membershipId,
          userId:
            existingUser.id,
          message:
            temporaryPassword
              ? "Existing CASA identity linked. A temporary password was created because the identity had no usable CASA sign-in credential; it must be replaced after first sign-in."
              : "Existing CASA identity linked. The staff member should sign in with their existing CASA password or Passkey.",
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

    return NextResponse.json(
      {
        created:
          true,
        reusedIdentity:
          false,
        temporaryPassword,
        membershipId,
        userId,
        message:
          "Staff account created. Give the temporary password directly to the staff member once; CASA will require them to replace it after first sign-in.",
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
