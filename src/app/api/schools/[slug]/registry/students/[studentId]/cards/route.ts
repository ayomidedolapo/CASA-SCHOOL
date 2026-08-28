import {
  and,
  desc,
  eq,
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  studentIdentityCardEvents,
  studentIdentityCards,
  students,
} from "@/db/schema";
import {
  createStudentCardCredential,
} from "@/server/identity/student-card";
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
  }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
  } = await context.params;

  try {
    const access =
      await requireRegistryAdmin(slug);
    const db = getDb();

    const studentRows = await db
      .select({
        id: students.id,
      })
      .from(students)
      .where(
        and(
          eq(
            students.schoolId,
            access.school.id,
          ),
          eq(
            students.id,
            studentId,
          ),
        ),
      )
      .limit(1);

    if (!studentRows[0]) {
      return NextResponse.json(
        {
          message:
            "Student not found.",
        },
        {
          status: 404,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const [cards, events] =
      await db.batch([
        db
          .select({
            id:
              studentIdentityCards.id,
            serialNumber:
              studentIdentityCards.serialNumber,
            status:
              studentIdentityCards.status,
            issuedAt:
              studentIdentityCards.issuedAt,
            expiresAt:
              studentIdentityCards.expiresAt,
            deactivatedAt:
              studentIdentityCards.deactivatedAt,
          })
          .from(
            studentIdentityCards,
          )
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
            ),
          )
          .orderBy(
            desc(
              studentIdentityCards.issuedAt,
            ),
          ),
        db
          .select({
            id:
              studentIdentityCardEvents.id,
            cardId:
              studentIdentityCardEvents.cardId,
            eventType:
              studentIdentityCardEvents.eventType,
            reason:
              studentIdentityCardEvents.reason,
            createdAt:
              studentIdentityCardEvents.createdAt,
          })
          .from(
            studentIdentityCardEvents,
          )
          .where(
            and(
              eq(
                studentIdentityCardEvents.schoolId,
                access.school.id,
              ),
              eq(
                studentIdentityCardEvents.studentId,
                studentId,
              ),
            ),
          )
          .orderBy(
            desc(
              studentIdentityCardEvents.createdAt,
            ),
          )
          .limit(50),
      ]);

    return NextResponse.json(
      {
        cards,
        events,
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

export async function POST(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
  } = await context.params;

  try {
    const access =
      await requireRegistryAdmin(slug);
    const db = getDb();

    const studentRows = await db
      .select({
        id: students.id,
      })
      .from(students)
      .where(
        and(
          eq(
            students.schoolId,
            access.school.id,
          ),
          eq(
            students.id,
            studentId,
          ),
          eq(
            students.status,
            "ACTIVE",
          ),
        ),
      )
      .limit(1);

    if (!studentRows[0]) {
      return NextResponse.json(
        {
          message:
            "Only an active student can receive a school ID card.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const credential =
      createStudentCardCredential();
    const now =
      new Date().toISOString();

    await db.execute(sql`
      with inserted_card as (
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
        values (
          ${access.school.id}::uuid,
          ${studentId}::uuid,
          ${credential.serialNumber},
          ${credential.tokenHash},
          'ACTIVE'::student_identity_card_status,
          ${now}::timestamptz,
          ${now}::timestamptz,
          ${now}::timestamptz
        )
        returning id
      )
      insert into student_identity_card_events (
        school_id,
        student_id,
        card_id,
        actor_membership_id,
        event_type,
        created_at
      )
      select
        ${access.school.id}::uuid,
        ${studentId}::uuid,
        inserted_card.id,
        ${access.membership.id}::uuid,
        'ISSUED'::student_identity_card_event_type,
        ${now}::timestamptz
      from inserted_card
    `);

    const cardRows = await db
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
            studentIdentityCards.tokenHash,
            credential.tokenHash,
          ),
        ),
      )
      .limit(1);

    if (!cardRows[0]) {
      throw new Error(
        "Issued student card could not be reloaded.",
      );
    }

    return NextResponse.json(
      {
        card: cardRows[0],
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