import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  ne,
  or,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getDb,
} from "@/db";
import {
  classArms,
  classLevels,
  schoolBranches,
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
import {
  registerStudentOnce,
  StudentCampusInvalidError,
  StudentCampusRequiredError,
  StudentDuplicateError,
} from "@/server/students/registration";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const visibility =
      await listVisibleBranches(slug);
    const access =
      await requireRegistryOperator(slug);
    const operationalBranches =
      visibility.branches as
        Array<{
          id: string;
          name: string;
          is_headquarters: boolean;
        }>;

    if (
      operationalBranches.length ===
      0
    ) {
      return NextResponse.json(
        {
          message:
            "No operational campus is available for this Registry operator.",
        },
        {
          status: 403,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const operationalBranchIds =
      operationalBranches.map(
        (branch) =>
          branch.id,
      );

    const searchParams =
      request.nextUrl
        .searchParams;

    const q =
      searchParams
        .get("q")
        ?.trim()
        .slice(
          0,
          100,
        ) ??
      "";

    const page =
      Math.max(
        1,
        Number.parseInt(
          searchParams.get(
            "page",
          ) ??
            "1",
          10,
        ) ||
          1,
      );

    const pageSize =
      25;
    const offset =
      (
        page -
        1
      ) *
      pageSize;
    const db =
      getDb();

    const searchCondition =
      q
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

    const baseCondition =
      and(
        eq(
          students.schoolId,
          access.school.id,
        ),
        ne(
          students.status,
          "ARCHIVED",
        ),
        operationalBranchIds.length ===
          1
          ? eq(
              students.homeBranchId,
              operationalBranchIds[0],
            )
          : inArray(
              students.homeBranchId,
              operationalBranchIds,
            ),
      );

    const whereCondition =
      searchCondition
        ? and(
            baseCondition,
            searchCondition,
          )
        : baseCondition;

    const [
      rows,
      totals,
    ] =
      await Promise.all([
        db
          .select({
            id:
              students.id,
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
            sex:
              students.sex,
            status:
              students.status,
            admissionDate:
              students.admissionDate,
            homeBranchId:
              students.homeBranchId,
            homeBranchName:
              schoolBranches.name,
            classArmName:
              classArms.name,
            classLevelName:
              classLevels.name,
          })
          .from(
            students,
          )
          .leftJoin(
            schoolBranches,
            and(
              eq(
                schoolBranches.schoolId,
                students.schoolId,
              ),
              eq(
                schoolBranches.id,
                students.homeBranchId,
              ),
            ),
          )
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
          .where(
            whereCondition,
          )
          .orderBy(
            asc(
              students.lastName,
            ),
            asc(
              students.firstName,
            ),
          )
          .limit(
            pageSize,
          )
          .offset(
            offset,
          ),
        db
          .select({
            count:
              count(),
          })
          .from(
            students,
          )
          .where(
            whereCondition,
          ),
      ]);

    const total =
      Number(
        totals[0]
          ?.count ??
          0,
      );

    return NextResponse.json(
      {
        students:
          rows,
        pagination: {
          page,
          pageSize,
          total,
          pages:
            Math.max(
              1,
              Math.ceil(
                total /
                  pageSize,
              ),
            ),
        },
        registrationCampus:
          operationalBranches.length ===
          1
            ? {
                id:
                  operationalBranches[0].id,
                name:
                  operationalBranches[0].name,
                isHeadquarters:
                  operationalBranches[0].is_headquarters,
              }
            : null,
        registrationCampuses:
          operationalBranches.map(
            (branch) => ({
              id:
                branch.id,
              name:
                branch.name,
              isHeadquarters:
                branch.is_headquarters,
            }),
          ),
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (
    error
  ) {
    const authResponse =
      registryAuthErrorResponse(
        error,
      );

    if (
      authResponse
    ) {
      return authResponse;
    }

    throw error;
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const visibility =
      await listVisibleBranches(slug);
    const access =
      await requireRegistryOperator(slug);
    const operationalBranches =
      visibility.branches as
        Array<{
          id: string;
          name: string;
          is_headquarters: boolean;
        }>;

    if (
      operationalBranches.length ===
      0
    ) {
      return NextResponse.json(
        {
          message:
            "No operational campus is available for this Registry operator.",
        },
        {
          status: 403,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const defaultOperationalBranch =
      operationalBranches.length ===
      1
        ? operationalBranches[0]
        : null;

    let body:
      unknown;

    try {
      body =
        await request.json();
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

    if (
      !parsed.success
    ) {
      return NextResponse.json(
        {
          message:
            "Invalid student details.",
          issues:
            parsed.error.issues.map(
              (
                issue,
              ) => ({
                path:
                  issue.path.join(
                    ".",
                  ),
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

    const requestedBranchId =
      parsed.data.branchId ??
      null;
    const operationalBranch =
      requestedBranchId
        ? operationalBranches.find(
            (branch) =>
              branch.id ===
              requestedBranchId,
          ) ?? null
        : defaultOperationalBranch;

    if (!operationalBranch) {
      return NextResponse.json(
        {
          message:
            operationalBranches.length >
            1
              ? "Select the campus where this student belongs."
              : "The selected campus is not available to this Registry operator.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const student =
      await registerStudentOnce({
        schoolId:
          access.school.id,
        branchId:
          operationalBranch.id,
        admissionNumber:
          parsed.data.admissionNumber,
        firstName:
          parsed.data.firstName,
        middleName:
          parsed.data.middleName,
        lastName:
          parsed.data.lastName,
        preferredName:
          parsed.data.preferredName,
        dateOfBirth:
          parsed.data.dateOfBirth,
        sex:
          parsed.data.sex,
        admissionDate:
          parsed.data.admissionDate,
      });

    return NextResponse.json(
      {
        student,
      },
      {
        status:
          201,
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (
    error
  ) {
    const authResponse =
      registryAuthErrorResponse(
        error,
      );

    if (
      authResponse
    ) {
      return authResponse;
    }

    if (
      error instanceof
      StudentDuplicateError
    ) {
      return NextResponse.json(
        {
          message:
            error.message,
          duplicate: {
            id:
              error.existing.id,
            casaStudentId:
              error.existing.casa_student_id,
          },
        },
        {
          status:
            409,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    if (
      error instanceof
        StudentCampusRequiredError ||
      error instanceof
        StudentCampusInvalidError
    ) {
      return NextResponse.json(
        {
          message:
            error.message,
        },
        {
          status:
            400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const databaseResponse =
      registryDatabaseErrorResponse(
        error,
      );

    if (
      databaseResponse
    ) {
      return databaseResponse;
    }

    throw error;
  }
}
