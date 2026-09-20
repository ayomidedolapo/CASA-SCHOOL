import {
  and,
  eq,
  inArray,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  academicSessions,
  classArms,
  studentEnrollments,
  students,
} from "@/db/schema";
import {
  registryAuthErrorResponse,
  registryDatabaseErrorResponse,
  registryNoStoreHeaders,
  requireRegistryOperator,
} from "@/server/registry/http";
import {
  enrollmentCreateSchema,
} from "@/server/registry/validation";
import {
  ensureFirstStudentCardForEnrollment,
} from "@/server/card-production/m38-lifecycle";

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
            "Invalid enrollment request.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const parsed =
      enrollmentCreateSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid enrollment details.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const db = getDb();

    const [
      studentRows,
      sessionRows,
      classArmRows,
    ] = await db.batch([
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
            eq(
              students.status,
              "ACTIVE",
            ),
          ),
        )
        .limit(1),
      db
        .select({
          id:
            academicSessions.id,
        })
        .from(academicSessions)
        .where(
          and(
            eq(
              academicSessions.schoolId,
              access.school.id,
            ),
            eq(
              academicSessions.id,
              parsed.data.academicSessionId,
            ),
            inArray(
              academicSessions.status,
              [
                "PLANNED",
                "ACTIVE",
              ],
            ),
          ),
        )
        .limit(1),
      db
        .select({
          id: classArms.id,
        })
        .from(classArms)
        .where(
          and(
            eq(
              classArms.schoolId,
              access.school.id,
            ),
            eq(
              classArms.id,
              parsed.data.classArmId,
            ),
            eq(
              classArms.isActive,
              true,
            ),
          ),
        )
        .limit(1),
    ]);

    if (
      !studentRows[0] ||
      !sessionRows[0] ||
      !classArmRows[0]
    ) {
      return NextResponse.json(
        {
          message:
            "Student, academic session, or class arm is unavailable.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const inserted = await db
      .insert(
        studentEnrollments,
      )
      .values({
        schoolId:
          access.school.id,
        studentId,
        academicSessionId:
          parsed.data.academicSessionId,
        classArmId:
          parsed.data.classArmId,
        startsOn:
          parsed.data.startsOn,
        status: "ACTIVE",
      })
      .returning({
        id:
          studentEnrollments.id,
        status:
          studentEnrollments.status,
      });

    let cardProvisioning:
      Awaited<
        ReturnType<
          typeof ensureFirstStudentCardForEnrollment
        >
      >;

    try {
      cardProvisioning =
        await ensureFirstStudentCardForEnrollment({
          access,
          studentId,
          enrollmentId:
            inserted[0].id,
          origin:
            request.nextUrl.origin,
        });
    } catch (cardError) {
      console.error(
        "Automatic first-card provisioning failed after enrollment",
        {
          schoolId:
            access.school.id,
          studentId,
          enrollmentId:
            inserted[0].id,
          cardError,
        },
      );

      cardProvisioning = {
        status:
          "STATE_CHANGED",
      };
    }

    return NextResponse.json(
      {
        enrollment:
          inserted[0],
        cardProvisioning,
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