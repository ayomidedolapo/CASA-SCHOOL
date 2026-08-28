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
  createStudentCardCredential,
} from "@/server/identity/student-card";
import {
  studentCardReplaceSchema,
} from "@/server/identity/validation";
import {
  registryAuthErrorResponse,
  registryDatabaseErrorResponse,
  registryNoStoreHeaders,
  requireRegistryAdmin,
} from "@/server/registry/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
    cardId: string;
  }>;
}

export async function POST(
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
      await requireRegistryAdmin(slug);

    let body: unknown = {};

    try {
      if (
        request.headers
          .get("content-length") !==
        "0"
      ) {
        body =
          await request.json();
      }
    } catch {
      body = {};
    }

    const parsed =
      studentCardReplaceSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid replacement request.",
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

    if (!currentRows[0]) {
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
      currentRows[0].status !==
      "ACTIVE"
    ) {
      return NextResponse.json(
        {
          message:
            "Only the active ID card can be replaced.",
        },
        {
          status: 409,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const credential =
      createStudentCardCredential();
    const now =
      new Date().toISOString();
    const replacementReason =
      parsed.data.reason ??
      "Replacement card issued";

    await db.execute(sql`
      with replaced_card as (
        update student_identity_cards
        set
          status = 'REPLACED'::student_identity_card_status,
          deactivated_at = ${now}::timestamptz,
          updated_at = ${now}::timestamptz
        where
          school_id = ${access.school.id}::uuid
          and student_id = ${studentId}::uuid
          and id = ${cardId}::uuid
          and status = 'ACTIVE'::student_identity_card_status
        returning id
      ),
      new_card as (
        insert into student_identity_cards (
          school_id,
          student_id,
          serial_number,
          token_hash,
          status,
          issued_at,
          created_at,
          updated_at
        )
        select
          ${access.school.id}::uuid,
          ${studentId}::uuid,
          ${credential.serialNumber},
          ${credential.tokenHash},
          'ACTIVE'::student_identity_card_status,
          ${now}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        from replaced_card
        returning id
      ),
      lifecycle_events as (
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
          replaced_card.id,
          ${access.membership.id}::uuid,
          'REPLACED'::student_identity_card_event_type,
          ${replacementReason},
          ${now}::timestamptz
        from replaced_card

        union all

        select
          ${access.school.id}::uuid,
          ${studentId}::uuid,
          new_card.id,
          ${access.membership.id}::uuid,
          'ISSUED'::student_identity_card_event_type,
          ${replacementReason},
          ${now}::timestamptz
        from new_card
        returning id
      )
      select count(*) from lifecycle_events
    `);

    const newRows = await db
      .select({
        id:
          studentIdentityCards.id,
        serialNumber:
          studentIdentityCards.serialNumber,
        status:
          studentIdentityCards.status,
        issuedAt:
          studentIdentityCards.issuedAt,
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
            studentIdentityCards.tokenHash,
            credential.tokenHash,
          ),
        ),
      )
      .limit(1);

    if (!newRows[0]) {
      return NextResponse.json(
        {
          message:
            "The active card changed before replacement could complete.",
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
        card: newRows[0],
        credential: {
          token:
            credential.token,
          payload:
            credential.payload,
        },
      },
      {
        status: 201,
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

    const databaseResponse =
      registryDatabaseErrorResponse(
        error,
      );

    if (databaseResponse) {
      return databaseResponse;
    }

    throw error;
  }
}