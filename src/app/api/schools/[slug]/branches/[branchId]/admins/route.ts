import {
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  neon,
} from "@neondatabase/serverless";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  sql,
} from "drizzle-orm";
import { z } from "zod";

import {
  getDatabaseUrl,
} from "@/config/env";
import {
  getDb,
} from "@/db";
import {
  normalizeLoginIdentifier,
} from "@/server/auth/identifier";
import {
  assignBranchAdministrator,
  listBranchAdministrators,
  requireOrganizationAdmin,
} from "@/server/school-operations/operations";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";
import {
  sendAccountAccessEmail,
} from "@/server/messaging/account-access-email";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    branchId: string;
  }>;
}

const schema =
  z.union([
    z.object({
      membershipId:
        z.string().uuid(),
      active:
        z.boolean()
          .default(true),
    }),
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
    }),
  ]);

function rowsOf<T>(
  value: unknown,
): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (
    value &&
    typeof value === "object" &&
    "rows" in value &&
    Array.isArray(
      (value as { rows?: unknown }).rows,
    )
  ) {
    return (value as { rows: T[] }).rows;
  }
  return [];
}

const tokenHash =
  (value: string) =>
    createHash("sha256")
      .update(value)
      .digest("hex");

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { slug, branchId } =
    await context.params;

  try {
    const access =
      await requireOrganizationAdmin(slug);
    const administrators =
      await listBranchAdministrators(
        access.school.id,
        branchId,
      );

    return NextResponse.json(
      { administrators },
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      schoolOperationsErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug, branchId } =
    await context.params;

  try {
    const access =
      await requireOrganizationAdmin(slug);
    const body =
      schema.safeParse(
        await request.json()
          .catch(() => null),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Enter an existing membership or a valid Branch Admin name and email.",
          issues:
            body.error.issues,
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    if (
      "membershipId" in
      body.data
    ) {
      const assignment =
        await assignBranchAdministrator({
          access,
          branchId,
          membershipId:
            body.data.membershipId,
          active:
            body.data.active,
        });

      return NextResponse.json(
        { assignment },
        {
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const branch =
      rowsOf<{
        id: string;
        name: string;
      }>(
        await getDb()
          .execute(sql`
            select id, name
            from school_branches
            where
              school_id =
                ${access.school.id}::uuid
              and id =
                ${branchId}::uuid
              and status =
                'ACTIVE'::school_branch_status
              and is_headquarters = false
            limit 1
          `),
      )[0];

    if (!branch) {
      return NextResponse.json(
        {
          message:
            "Select an active non-HQ branch.",
        },
        {
          status: 404,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const identity =
      normalizeLoginIdentifier(
        body.data.email,
      );

    if (
      !identity ||
      identity.kind !==
        "EMAIL"
    ) {
      return NextResponse.json(
        {
          message:
            "Enter a valid Branch Admin email.",
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const db = getDb();
    const user =
      rowsOf<{
        id: string;
        full_name: string;
        status: string;
        has_password: boolean;
      }>(
        await db.execute(sql`
          select
            u.id,
            u.full_name,
            u.status::text as status,
            exists(
              select 1
              from auth_password_credentials p
              where p.user_id = u.id
            ) as has_password
          from users u
          where
            u.email =
              ${identity.value}
          limit 1
        `),
      )[0];

    if (
      user &&
      user.status !==
        "ACTIVE"
    ) {
      return NextResponse.json(
        {
          message:
            "That email belongs to an inactive CASA identity.",
        },
        {
          status: 409,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const existingMembership =
      user
        ? rowsOf<{
            id: string;
            is_owner: boolean;
          }>(
            await db.execute(sql`
              select
                m.id,
                exists(
                  select 1
                  from school_membership_roles r
                  where
                    r.school_id =
                      m.school_id
                    and r.membership_id =
                      m.id
                    and r.role =
                      'OWNER'::school_membership_role
                ) as is_owner
              from school_memberships m
              where
                m.school_id =
                  ${access.school.id}::uuid
                and m.user_id =
                  ${user.id}::uuid
              limit 1
            `),
          )[0]
        : undefined;

    if (
      existingMembership?.is_owner
    ) {
      return NextResponse.json(
        {
          message:
            "The school Owner cannot be converted into a Branch Admin assignment.",
        },
        {
          status: 409,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const userId =
      user?.id ??
      randomUUID();
    const membershipId =
      existingMembership?.id ??
      randomUUID();
    const needsSetup =
      !user ||
      !user.has_password;
    const rawToken =
      needsSetup
        ? randomBytes(32)
            .toString("base64url")
        : null;
    const hash =
      rawToken
        ? tokenHash(rawToken)
        : null;
    const expiresAt =
      new Date(
        Date.now() +
          24 * 60 * 60 *
            1000,
      ).toISOString();

    const client =
      neon(
        getDatabaseUrl(),
      );
    const statements = [];

    if (!user) {
      statements.push(
        client`
          insert into users(
            id,
            full_name,
            email,
            phone,
            status
          )
          values(
            ${userId}::uuid,
            ${body.data.fullName},
            ${identity.value},
            null,
            'ACTIVE'
          )
        `,
      );
    }

    if (!existingMembership) {
      statements.push(
        client`
          insert into school_memberships(
            id,
            school_id,
            user_id,
            status,
            joined_at
          )
          values(
            ${membershipId}::uuid,
            ${access.school.id}::uuid,
            ${userId}::uuid,
            'ACTIVE',
            now()
          )
        `,
      );
    } else {
      statements.push(
        client`
          update school_memberships
          set
            status =
              'ACTIVE'::school_membership_status,
            updated_at =
              now()
          where
            school_id =
              ${access.school.id}::uuid
            and id =
              ${membershipId}::uuid
        `,
      );
    }

    statements.push(
      client`
        insert into school_membership_roles(
          id,
          school_id,
          membership_id,
          role
        )
        values(
          ${randomUUID()}::uuid,
          ${access.school.id}::uuid,
          ${membershipId}::uuid,
          'ADMIN'
        )
        on conflict (
          membership_id,
          role
        )
        do nothing
      `,
    );

    statements.push(
      client`
        insert into school_branch_admin_assignments(
          id,
          school_id,
          branch_id,
          membership_id,
          is_active,
          assigned_by_membership_id,
          created_at,
          updated_at
        )
        values(
          ${randomUUID()}::uuid,
          ${access.school.id}::uuid,
          ${branchId}::uuid,
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
      `,
    );

    if (
      needsSetup &&
      hash
    ) {
      statements.push(
        client`
          update casa_account_setup_tokens
          set used_at = now()
          where
            user_id =
              ${userId}::uuid
            and used_at is null
        `,
      );
      statements.push(
        client`
          insert into casa_account_setup_tokens(
            user_id,
            token_hash,
            purpose,
            created_by_internal_membership_id,
            expires_at
          )
          values(
            ${userId}::uuid,
            ${hash},
            'BRANCH_ADMIN',
            null,
            ${expiresAt}::timestamptz
          )
        `,
      );
    }

    await client.transaction(
      statements,
    );

    const origin =
      new URL(
        request.url,
      ).origin;

    const setup =
      rawToken
        ? {
            url:
              `${origin}/account/setup?token=${encodeURIComponent(
                rawToken,
              )}`,
            expiresAt,
          }
        : null;
    const emailDelivery =
      await sendAccountAccessEmail({
        email:
          identity.value,
        recipientName:
          user?.full_name ??
          body.data.fullName,
        organizationName:
          access.school.name,
        actionLabel:
          setup
            ? "Set up Branch Admin access"
            : "Sign in to CASA",
        actionUrl:
          setup?.url ??
          `${origin}/login?school=${encodeURIComponent(
            slug,
          )}`,
        expiresAt:
          setup?.expiresAt ??
          null,
        context:
          `${access.school.name} granted you Branch Admin access for ${branch.name}.`,
      });

    return NextResponse.json(
      {
        emailDelivery,
        assignment: {
          membershipId,
          branchId,
          active: true,
        },
        administrator: {
          fullName:
            user?.full_name ??
            body.data.fullName,
          email:
            identity.value,
          existingIdentity:
            Boolean(user),
          setup,
        },
      },
      {
        status:
          existingMembership
            ? 200
            : 201,
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      schoolOperationsErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
