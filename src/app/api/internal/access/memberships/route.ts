import {
  NextRequest,
  NextResponse,
} from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  requireCasaSuperAdmin,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";
import {
  writeCasaInternalAudit,
} from "@/server/internal/onboarding";

export const dynamic =
  "force-dynamic";

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

const bodySchema =
  z.object({
    userId:
      z.string().uuid(),
    role:
      z.enum([
        "CASA_SUPER_ADMIN",
        "CASA_TEAM",
      ]),
    status:
      z.enum([
        "ACTIVE",
        "SUSPENDED",
      ])
        .default("ACTIVE"),
  });

export async function GET(
  _request: NextRequest,
) {
  try {
    await requireCasaSuperAdmin();
    const db = getDb();

    const result =
      await db.execute(sql`
        select
          membership.id,
          membership.user_id,
          actor.full_name,
          actor.email,
          actor.phone,
          membership.role,
          membership.status,
          membership.created_at,
          membership.updated_at,
          (
            select count(*)::int
            from casa_internal_school_assignments
              assignment
            where
              assignment.membership_id =
                membership.id
              and assignment.status =
                'ACTIVE'
          ) as assigned_school_count
        from casa_internal_memberships
          membership
        join users
          actor
          on actor.id =
             membership.user_id
        order by
          actor.full_name asc,
          membership.created_at asc
      `);

    return NextResponse.json(
      {
        memberships:
          rowsOf(result),
      },
      {
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      casaInternalAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const access =
      await requireCasaSuperAdmin();

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid CASA membership request.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const parsed =
      bodySchema.safeParse(
        raw,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid CASA membership.",
          issues:
            parsed.error.issues,
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const db = getDb();
    const result =
      await db.execute(sql`
        insert into casa_internal_memberships (
          user_id,
          role,
          status,
          created_at,
          updated_at
        )
        select
          actor.id,
          ${parsed.data.role},
          ${parsed.data.status},
          now(),
          now()
        from users
          actor
        where
          actor.id =
            ${parsed.data.userId}::uuid
          and actor.status =
            'ACTIVE'::user_status
        on conflict (
          user_id
        )
        do update set
          role =
            excluded.role,
          status =
            excluded.status,
          updated_at =
            now()
        returning
          id,
          user_id,
          role,
          status
      `);

    const membership =
      rowsOf<Record<
        string,
        unknown
      >>(
        result,
      )[0];

    if (!membership) {
      return NextResponse.json(
        {
          message:
            "Active user not found.",
        },
        {
          status: 404,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    await writeCasaInternalAudit({
      access,
      action:
        "INTERNAL_MEMBERSHIP_UPSERTED",
      subjectType:
        "CASA_INTERNAL_MEMBERSHIP",
      subjectId:
        String(
          membership.id,
        ),
      metadata: {
        role:
          parsed.data.role,
        status:
          parsed.data.status,
      },
    });

    return NextResponse.json(
      {
        membership,
      },
      {
        status: 201,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      casaInternalAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}
