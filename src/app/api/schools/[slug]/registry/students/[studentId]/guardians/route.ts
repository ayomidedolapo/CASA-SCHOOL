import {
  and,
  eq,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  guardians,
  studentGuardians,
  students,
} from "@/db/schema";
import {
  registryAuthErrorResponse,
  registryDatabaseErrorResponse,
  registryNoStoreHeaders,
  requireRegistryAdmin,
} from "@/server/registry/http";
import {
  guardianLinkSchema,
} from "@/server/registry/validation";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
  }>;
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
  } = await context.params;

  try {
    const access =
      await requireRegistryAdmin(slug);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid guardian-link request.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const parsed =
      guardianLinkSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid guardian relationship.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const db = getDb();

    const [studentRows, guardianRows] =
      await db.batch([
        db
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
          .limit(1),
        db
          .select({
            id: guardians.id,
          })
          .from(guardians)
          .where(
            and(
              eq(
                guardians.schoolId,
                access.school.id,
              ),
              eq(
                guardians.id,
                parsed.data.guardianId,
              ),
              eq(
                guardians.status,
                "ACTIVE",
              ),
            ),
          )
          .limit(1),
      ]);

    if (
      !studentRows[0] ||
      !guardianRows[0]
    ) {
      return NextResponse.json(
        {
          message:
            "Student or guardian is unavailable.",
        },
        {
          status: 404,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const inserted = await db
      .insert(studentGuardians)
      .values({
        schoolId:
          access.school.id,
        studentId,
        guardianId:
          parsed.data.guardianId,
        relationshipLabel:
          parsed.data.relationshipLabel,
        isPrimary:
          parsed.data.isPrimary,
        isEmergencyContact:
          parsed.data.isEmergencyContact,
        pickupAuthorized:
          parsed.data.pickupAuthorized,
        receivesNotifications:
          parsed.data.receivesNotifications,
      })
      .returning({
        id: studentGuardians.id,
      });

    return NextResponse.json(
      {
        relationship:
          inserted[0],
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