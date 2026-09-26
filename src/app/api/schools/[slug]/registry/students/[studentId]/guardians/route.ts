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
  requireRegistryOperator,
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
      await requireRegistryOperator(slug);

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
            phone:
              guardians.phone,
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

    const existingLinkRows =
      await db
        .select({
          id:
            studentGuardians.id,
        })
        .from(
          studentGuardians,
        )
        .where(
          and(
            eq(
              studentGuardians.schoolId,
              access.school.id,
            ),
            eq(
              studentGuardians.studentId,
              studentId,
            ),
            eq(
              studentGuardians.guardianId,
              parsed.data.guardianId,
            ),
          ),
        )
        .limit(1);

    if (existingLinkRows[0]) {
      return NextResponse.json(
        {
          message:
            "This guardian is already linked to this student.",
        },
        {
          status: 409,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const relationshipValues = {
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
    };

    let inserted:
      Array<{
        id: string;
      }>;

    if (parsed.data.isPrimary) {
      const batch =
        await db.batch([
          db
            .update(
              studentGuardians,
            )
            .set({
              isPrimary: false,
              updatedAt:
                new Date(),
            })
            .where(
              and(
                eq(
                  studentGuardians.schoolId,
                  access.school.id,
                ),
                eq(
                  studentGuardians.studentId,
                  studentId,
                ),
                eq(
                  studentGuardians.isPrimary,
                  true,
                ),
              ),
            ),
          db
            .insert(
              studentGuardians,
            )
            .values(
              relationshipValues,
            )
            .returning({
              id:
                studentGuardians.id,
            }),
        ]);

      inserted =
        batch[1];
    } else {
      inserted = await db
        .insert(
          studentGuardians,
        )
        .values(
          relationshipValues,
        )
        .returning({
          id:
            studentGuardians.id,
        });
    }

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

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
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
            "Invalid guardian notification update.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const parsed =
      body &&
      typeof body ===
        "object" &&
      !Array.isArray(body)
        ? body as {
            linkId?: unknown;
          }
        : {};

    const linkId =
      typeof parsed.linkId ===
        "string"
        ? parsed.linkId
        : "";

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        linkId,
      )
    ) {
      return NextResponse.json(
        {
          message:
            "Select a valid guardian relationship.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const db = getDb();
    const targetRows =
      await db
        .select({
          id:
            studentGuardians.id,
        })
        .from(
          studentGuardians,
        )
        .innerJoin(
          guardians,
          and(
            eq(
              guardians.schoolId,
              studentGuardians.schoolId,
            ),
            eq(
              guardians.id,
              studentGuardians.guardianId,
            ),
          ),
        )
        .where(
          and(
            eq(
              studentGuardians.schoolId,
              access.school.id,
            ),
            eq(
              studentGuardians.studentId,
              studentId,
            ),
            eq(
              studentGuardians.id,
              linkId,
            ),
            eq(
              guardians.status,
              "ACTIVE",
            ),
          ),
        )
        .limit(1);

    const target =
      targetRows[0];

    if (!target) {
      return NextResponse.json(
        {
          message:
            "Guardian relationship is unavailable.",
        },
        {
          status: 404,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const selectedRows =
      await db
        .update(
          studentGuardians,
        )
        .set({
          receivesNotifications:
            true,
          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              studentGuardians.schoolId,
              access.school.id,
            ),
            eq(
              studentGuardians.studentId,
              studentId,
            ),
            eq(
              studentGuardians.id,
              linkId,
            ),
          ),
        )
        .returning({
          id:
            studentGuardians.id,
          receivesNotifications:
            studentGuardians.receivesNotifications,
        });

    const selected =
      selectedRows[0];

    return NextResponse.json(
      {
        notificationRecipient:
          selected,
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
