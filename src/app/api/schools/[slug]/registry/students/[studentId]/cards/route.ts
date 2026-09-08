import {
  and,
  desc,
  eq,
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
  registryAuthErrorResponse,
  registryNoStoreHeaders,
  requireRegistryOperator,
} from "@/server/registry/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
  }>;
}

export async function GET(
  _request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
    studentId,
  } =
    await context.params;

  try {
    const access =
      await requireRegistryOperator(
        slug,
      );
    const db = getDb();

    const studentRows =
      await db
        .select({
          id:
            students.id,
        })
        .from(
          students,
        )
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

    if (
      !studentRows[0]
    ) {
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

    const [
      cards,
      events,
    ] =
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
    await requireRegistryOperator(
      slug,
    );

    return NextResponse.json(
      {
        message:
          "Raw student-card issuance is disabled. Use the Passkey-protected production endpoint.",
        code:
          "CARD_PRODUCTION_REQUIRED",
        endpoint:
          "cards/production",
      },
      {
        status: 409,
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