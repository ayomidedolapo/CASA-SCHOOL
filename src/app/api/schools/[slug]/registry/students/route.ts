import {
  and,
  asc,
  count,
  eq,
  ilike,
  or,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  classArms,
  classLevels,
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
  studentCreateSchema,
} from "@/server/registry/validation";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

  try {
    const access =
      await requireRegistryOperator(slug);

    const searchParams =
      request.nextUrl.searchParams;

    const q =
      searchParams
        .get("q")
        ?.trim()
        .slice(0, 100) ?? "";

    const page = Math.max(
      1,
      Number.parseInt(
        searchParams.get("page") ??
          "1",
        10,
      ) || 1,
    );

    const pageSize = 25;
    const offset =
      (page - 1) * pageSize;
    const db = getDb();

    const searchCondition = q
      ? or(
          ilike(
            students.casaStudentId,
            `%${q}%`,
          ),
          ilike(
            students.admissionNumber,
            `%${q}%`,
          ),
          ilike(
            students.firstName,
            `%${q}%`,
          ),
          ilike(
            students.lastName,
            `%${q}%`,
          ),
        )
      : undefined;

    const whereCondition =
      searchCondition
        ? and(
            eq(
              students.schoolId,
              access.school.id,
            ),
            searchCondition,
          )
        : eq(
            students.schoolId,
            access.school.id,
          );

    const rows = await db
      .select({
        id: students.id,
        casaStudentId:
          students.casaStudentId,
        admissionNumber:
          students.admissionNumber,
        firstName:
          students.firstName,
        middleName:
          students.middleName,
        lastName:
          students.lastName,
        preferredName:
          students.preferredName,
        dateOfBirth:
          students.dateOfBirth,
        sex: students.sex,
        status: students.status,
        admissionDate:
          students.admissionDate,
        classArmName:
          classArms.name,
        classLevelName:
          classLevels.name,
      })
      .from(students)
      .leftJoin(
        studentEnrollments,
        and(
          eq(
            studentEnrollments.schoolId,
            students.schoolId,
          ),
          eq(
            studentEnrollments.studentId,
            students.id,
          ),
          eq(
            studentEnrollments.status,
            "ACTIVE",
          ),
        ),
      )
      .leftJoin(
        classArms,
        and(
          eq(
            classArms.schoolId,
            students.schoolId,
          ),
          eq(
            classArms.id,
            studentEnrollments.classArmId,
          ),
        ),
      )
      .leftJoin(
        classLevels,
        and(
          eq(
            classLevels.schoolId,
            students.schoolId,
          ),
          eq(
            classLevels.id,
            classArms.classLevelId,
          ),
        ),
      )
      .where(whereCondition)
      .orderBy(
        asc(students.lastName),
        asc(students.firstName),
      )
      .limit(pageSize)
      .offset(offset);

    const totals = await db
      .select({
        count: count(),
      })
      .from(students)
      .where(whereCondition);

    const total =
      Number(totals[0]?.count ?? 0);

    return NextResponse.json(
      {
        students: rows,
        pagination: {
          page,
          pageSize,
          total,
          pages: Math.max(
            1,
            Math.ceil(
              total / pageSize,
            ),
          ),
        },
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
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

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
            "Invalid student request.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const parsed =
      studentCreateSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid student details.",
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
    const input = parsed.data;

    const inserted = await db
      .insert(students)
      .values({
        schoolId:
          access.school.id,
        admissionNumber:
          input.admissionNumber
            ? input.admissionNumber
                .trim()
                .toUpperCase()
            : null,
        firstName:
          input.firstName,
        middleName:
          input.middleName || null,
        lastName:
          input.lastName,
        preferredName:
          input.preferredName || null,
        dateOfBirth:
          input.dateOfBirth,
        sex: input.sex,
        admissionDate:
          input.admissionDate,
      })
      .returning({
        id: students.id,
        casaStudentId:
          students.casaStudentId,
        admissionNumber:
          students.admissionNumber,
        firstName:
          students.firstName,
        lastName:
          students.lastName,
        status: students.status,
      });

    return NextResponse.json(
      {
        student: inserted[0],
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