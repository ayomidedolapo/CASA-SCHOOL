import {
  and,
  asc,
  eq,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  academicSessions,
  classArms,
  classLevels,
  guardians,
  studentEnrollments,
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
  studentUpdateSchema,
} from "@/server/registry/validation";

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
      await requireRegistryOperator(slug);
    const db = getDb();

    const studentRows = await db
      .select()
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

    const student =
      studentRows[0];

    if (!student) {
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
      guardianRows,
      enrollmentRows,
    ] =
      await Promise.all([
      db
              .select({
                linkId:
                  studentGuardians.id,
                guardianId:
                  guardians.id,
                fullName:
                  guardians.fullName,
                email: guardians.email,
                phone: guardians.phone,
                relationshipLabel:
                  studentGuardians.relationshipLabel,
                isPrimary:
                  studentGuardians.isPrimary,
                isEmergencyContact:
                  studentGuardians.isEmergencyContact,
                pickupAuthorized:
                  studentGuardians.pickupAuthorized,
                receivesNotifications:
                  studentGuardians.receivesNotifications,
              })
              .from(studentGuardians)
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
                ),
              )
              .orderBy(
                asc(
                  guardians.fullName,
                ),
              ),
      db
                .select({
                  id:
                    studentEnrollments.id,
                  status:
                    studentEnrollments.status,
                  startsOn:
                    studentEnrollments.startsOn,
                  endsOn:
                    studentEnrollments.endsOn,
                  academicSessionId:
                    academicSessions.id,
                  academicSessionName:
                    academicSessions.name,
                  classArmId:
                    classArms.id,
                  classArmName:
                    classArms.name,
                  classLevelName:
                    classLevels.name,
                })
                .from(studentEnrollments)
                .innerJoin(
                  academicSessions,
                  and(
                    eq(
                      academicSessions.schoolId,
                      studentEnrollments.schoolId,
                    ),
                    eq(
                      academicSessions.id,
                      studentEnrollments.academicSessionId,
                    ),
                  ),
                )
                .innerJoin(
                  classArms,
                  and(
                    eq(
                      classArms.schoolId,
                      studentEnrollments.schoolId,
                    ),
                    eq(
                      classArms.id,
                      studentEnrollments.classArmId,
                    ),
                  ),
                )
                .innerJoin(
                  classLevels,
                  and(
                    eq(
                      classLevels.schoolId,
                      studentEnrollments.schoolId,
                    ),
                    eq(
                      classLevels.id,
                      classArms.classLevelId,
                    ),
                  ),
                )
                .where(
                  and(
                    eq(
                      studentEnrollments.schoolId,
                      access.school.id,
                    ),
                    eq(
                      studentEnrollments.studentId,
                      studentId,
                    ),
                  ),
                )
                .orderBy(
                  asc(
                    studentEnrollments.startsOn,
                  ),
                ),
    ]);

    return NextResponse.json(
      {
        student,
        guardians:
          guardianRows,
        enrollments:
          enrollmentRows,
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
            "Invalid student update.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const parsed =
      studentUpdateSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid student update.",
          issues:
            parsed.error.issues.map(
              (issue) => ({
                path:
                  issue.path.join("."),
                message:
                  issue.message,
              }),
            ),
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const db = getDb();

    const updated = await db
      .update(students)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
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
      .returning({
        id: students.id,
        status: students.status,
      });

    if (!updated[0]) {
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

    return NextResponse.json(
      {
        student: updated[0],
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