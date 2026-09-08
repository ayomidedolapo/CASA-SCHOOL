import {
  NextRequest,
  NextResponse,
} from "next/server";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  CASA_SENSITIVE_CAPABILITIES,
  requireCasaSuperAdmin,
  type CasaSensitiveCapability,
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
    capability: string;
  }>;
}

function isCapability(
  value: string,
): value is CasaSensitiveCapability {
  return (
    CASA_SENSITIVE_CAPABILITIES as
      readonly string[]
  ).includes(value);
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
    capability,
  } = await context.params;

  if (!isCapability(capability)) {
    return NextResponse.json(
      {
        message:
          "Unknown CASA capability.",
      },
      {
        status: 400,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  }

  try {
    const access =
      await requireCasaSuperAdmin();
    const db = getDb();

    const result =
      await db.execute(sql`
        insert into casa_internal_capability_grants (
          membership_id,
          capability,
          granted_by_membership_id,
          granted_at,
          revoked_at
        )
        select
          membership.id,
          ${capability},
          ${access.membership.id}::uuid,
          now(),
          null
        from casa_internal_memberships
          membership
        where
          membership.id =
            ${membershipId}::uuid
          and membership.status =
            'ACTIVE'
        on conflict (
          membership_id,
          capability
        )
        do update set
          granted_by_membership_id =
            excluded.granted_by_membership_id,
          granted_at =
            now(),
          revoked_at =
            null
        returning id
      `);

    const granted =
      rowsOf(
        result,
      ).length ===
      1;

    if (!granted) {
      return NextResponse.json(
        {
          message:
            "CASA membership not found.",
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
        "INTERNAL_CAPABILITY_GRANTED",
      subjectType:
        "CASA_INTERNAL_MEMBERSHIP",
      subjectId:
        membershipId,
      metadata: {
        capability,
      },
    });

    return NextResponse.json(
      {
        granted: true,
        capability,
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
    capability,
  } = await context.params;

  if (!isCapability(capability)) {
    return NextResponse.json(
      {
        message:
          "Unknown CASA capability.",
      },
      {
        status: 400,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  }

  try {
    const access =
      await requireCasaSuperAdmin();
    const db = getDb();

    const result =
      await db.execute(sql`
        update casa_internal_capability_grants
        set
          revoked_at =
            now()
        where
          membership_id =
            ${membershipId}::uuid
          and capability =
            ${capability}
          and revoked_at is null
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
        action:
          "INTERNAL_CAPABILITY_REVOKED",
        subjectType:
          "CASA_INTERNAL_MEMBERSHIP",
        subjectId:
          membershipId,
        metadata: {
          capability,
        },
      });
    }

    return NextResponse.json(
      {
        revoked,
        capability,
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
