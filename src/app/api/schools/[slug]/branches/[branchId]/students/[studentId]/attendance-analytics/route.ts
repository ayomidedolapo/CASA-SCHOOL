import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  getStudentAttendanceAnalytics,
} from "@/server/attendance/student-analytics";
import {
  requireBranchAccess,
} from "@/server/school-operations/operations";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    branchId: string;
    studentId: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    branchId,
    studentId,
  } =
    await context.params;

  try {
    const identifiers =
      z.object({
        branchId:
          z.string().uuid(),
        studentId:
          z.string().uuid(),
        academicSessionId:
          z.string().uuid(),
        academicTermId:
          z.string()
            .uuid()
            .nullable(),
      }).safeParse({
        branchId,
        studentId,
        academicSessionId:
          request.nextUrl
            .searchParams
            .get(
              "academicSessionId",
            ),
        academicTermId:
          request.nextUrl
            .searchParams
            .get(
              "academicTermId",
            ),
      });

    if (
      !identifiers.success
    ) {
      return NextResponse.json(
        {
          message:
            "A valid branch, student, and academicSessionId are required; academicTermId is optional.",
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const branchAccess =
      await requireBranchAccess(
        slug,
        branchId,
      );

    const analytics =
      await getStudentAttendanceAnalytics({
        schoolId:
          branchAccess.access.school.id,
        schoolTimezone:
          branchAccess.access.school.timezone,
        branchId,
        studentId,
        academicSessionId:
          identifiers.data
            .academicSessionId,
        academicTermId:
          identifiers.data
            .academicTermId,
      });

    if (!analytics) {
      return NextResponse.json(
        {
          message:
            "No attendance analytics scope was found for this student, branch, and academic period.",
        },
        {
          status: 404,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      analytics,
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      schoolOperationsErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}
