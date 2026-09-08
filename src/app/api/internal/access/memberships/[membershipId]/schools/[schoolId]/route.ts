import {
  NextRequest,
  NextResponse,
} from "next/server";
import { sql } from "drizzle-orm";

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

interface RouteContext {
  params: Promise<{
    membershipId: string;
    schoolId: string;
  }>;
}

function rowsOf(
  result: unknown,
): unknown[] {
  if (Array.isArray(result)) {
    return result;
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
        rows: unknown[];
      }
    ).rows;
  }

  return [];
}

export async function PUT(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    membershipId,
    schoolId,
  } = await context.params;

  try {
    const access =
      await requireCasaSuperAdmin();
    const db = getDb();

    const result =
      await db.execute(sql`
        insert into casa_internal_school_assignments (
          membership_id,
          school_id,
          status,
          assigned_by_membership_id,
          assigned_at,
          revoked_at
        )
        select
          membership.id,
          school.id,
          'ACTIVE',
          ${access.membership.id}::uuid,
          now(),
          null
        from casa_internal_memberships
          membership
        cross join schools
          school
        where
          membership.id =
            ${membershipId}::uuid
          and membership.status =
            'ACTIVE'
          and school.id =
            ${schoolId}::uuid
          and school.status =
            'ACTIVE'::school_status
        on conflict (
          membership_id,
          school_id
        )
        do update set
          status =
            'ACTIVE',
          assigned_by_membership_id =
            excluded.assigned_by_membership_id,
          assigned_at =
            now(),
          revoked_at =
            null
        returning
          id,
          membership_id,
          school_id,
          status
      `);

    const assignment =
      rowsOf(
        result,
      )[0];

    if (!assignment) {
      return NextResponse.json(
        {
          message:
            "CASA membership or school not found.",
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
      schoolId,
      action:
        "INTERNAL_SCHOOL_ASSIGNED",
      subjectType:
        "CASA_INTERNAL_MEMBERSHIP",
      subjectId:
        membershipId,
    });

    return NextResponse.json(
      {
        assignment,
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

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    membershipId,
    schoolId,
  } = await context.params;

  try {
    const access =
      await requireCasaSuperAdmin();
    const db = getDb();

    const result =
      await db.execute(sql`
        update casa_internal_school_assignments
        set
          status =
            'REVOKED',
          revoked_at =
            now()
        where
          membership_id =
            ${membershipId}::uuid
          and school_id =
            ${schoolId}::uuid
          and status =
            'ACTIVE'
        returning id
      `);

    const revoked =
      rowsOf(
        result,
      ).length ===
      1;

    if (revoked) {
      await writeCasaInternalAudit({
        access,
        schoolId,
        action:
          "INTERNAL_SCHOOL_REVOKED",
        subjectType:
          "CASA_INTERNAL_MEMBERSHIP",
        subjectId:
          membershipId,
      });
    }

    return NextResponse.json(
      {
        revoked,
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
