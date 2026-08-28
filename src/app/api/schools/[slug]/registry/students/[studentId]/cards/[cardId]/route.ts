import {
  and,
  eq,
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  studentIdentityCards,
} from "@/db/schema";
import {
  studentCardDeactivateSchema,
} from "@/server/identity/validation";
import {
  registryAuthErrorResponse,
  registryNoStoreHeaders,
  requireRegistryOperator,
} from "@/server/registry/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
    cardId: string;
  }>;
}

const eventTypeByStatus = {
  LOST: "MARKED_LOST",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
} as const;

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
    cardId,
  } = await context.params;

  try {
    const access =
      await requireRegistryOperator(slug);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid card lifecycle request.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const parsed =
      studentCardDeactivateSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid card lifecycle request.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const db = getDb();

    const currentRows = await db
      .select({
        id:
          studentIdentityCards.id,
        status:
          studentIdentityCards.status,
      })
      .from(studentIdentityCards)
      .where(
        and(
          eq(
            studentIdentityCards.schoolId,
            access.school.id,
          ),
          eq(
            studentIdentityCards.studentId,
            studentId,
          ),
          eq(
            studentIdentityCards.id,
            cardId,
          ),
        ),
      )
      .limit(1);

    const current =
      currentRows[0];

    if (!current) {
      return NextResponse.json(
        {
          message:
            "Student ID card not found.",
        },
        {
          status: 404,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    if (
      current.status ===
      parsed.data.status
    ) {
      return NextResponse.json(
        {
          card: current,
        },
        {
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    if (current.status !== "ACTIVE") {
      return NextResponse.json(
        {
          message:
            "Only an active ID card can be deactivated.",
        },
        {
          status: 409,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const now =
      new Date().toISOString();
    const eventType =
      eventTypeByStatus[
        parsed.data.status
      ];

    await db.execute(sql`
      with changed_card as (
        update student_identity_cards
        set
          status = ${parsed.data.status}::student_identity_card_status,
          deactivated_at = ${now}::timestamptz,
          updated_at = ${now}::timestamptz
        where
          school_id = ${access.school.id}::uuid
          and student_id = ${studentId}::uuid
          and id = ${cardId}::uuid
          and status = 'ACTIVE'::student_identity_card_status
        returning id
      )
      insert into student_identity_card_events (
        school_id,
        student_id,
        card_id,
        actor_membership_id,
        event_type,
        reason,
        created_at
      )
      select
        ${access.school.id}::uuid,
        ${studentId}::uuid,
        changed_card.id,
        ${access.membership.id}::uuid,
        ${eventType}::student_identity_card_event_type,
        ${parsed.data.reason ?? null},
        ${now}::timestamptz
      from changed_card
    `);

    const updatedRows = await db
      .select({
        id:
          studentIdentityCards.id,
        status:
          studentIdentityCards.status,
        deactivatedAt:
          studentIdentityCards.deactivatedAt,
      })
      .from(studentIdentityCards)
      .where(
        and(
          eq(
            studentIdentityCards.schoolId,
            access.school.id,
          ),
          eq(
            studentIdentityCards.id,
            cardId,
          ),
        ),
      )
      .limit(1);

    if (
      updatedRows[0]?.status !==
      parsed.data.status
    ) {
      return NextResponse.json(
        {
          message:
            "The card changed before this lifecycle action could complete.",
        },
        {
          status: 409,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        card: updatedRows[0],
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const authResponse =
      registryAuthErrorResponse(
        error,
      );

    if (authResponse) {
      return authResponse;
    }

    throw error;
  }
}