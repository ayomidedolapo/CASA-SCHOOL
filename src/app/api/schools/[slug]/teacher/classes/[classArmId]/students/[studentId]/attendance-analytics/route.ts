import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  getStudentAttendanceAnalytics,
} from "@/server/attendance/student-analytics";
import {
  requireTeacherAccess,
  requireTeacherStudentInClass,
} from "@/server/teacher/my-class";
import {
  teacherMyClassErrorResponse,
  teacherMyClassNoStoreHeaders,
} from "@/server/teacher/http";

// The delegated analytics service is authoritative for both
// attendancePercentage and punctualityPercentage.
export const dynamic =
  "force-dynamic";

interface RouteContext {
  params:
    Promise<{
      slug:
        string;
      classArmId:
        string;
      studentId:
        string;
    }>;
}

export async function GET(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
    classArmId,
    studentId,
  } =
    await context.params;

  try {
    const identifiers =
      z.object({
        classArmId:
          z.string()
            .uuid(),
        studentId:
          z.string()
            .uuid(),
        sessionId:
          z.string()
            .uuid(),
        termId:
          z.string()
            .uuid()
            .nullable(),
      }).safeParse({
        classArmId,
        studentId,
        sessionId:
          request.nextUrl
            .searchParams
            .get(
              "sessionId",
            ),
        termId:
          request.nextUrl
            .searchParams
            .get(
              "termId",
            ),
      });

    if (
      !identifiers.success
    ) {
      return NextResponse.json(
        {
          message:
            "Valid classArmId, studentId and sessionId are required; termId is optional.",
        },
        {
          status:
            400,
          headers:
            teacherMyClassNoStoreHeaders,
        },
      );
    }

    const access =
      await requireTeacherAccess(
        slug,
      );

    const assignment =
      await requireTeacherStudentInClass({
        access,
        classArmId:
          identifiers.data
            .classArmId,
        academicSessionId:
          identifiers.data
            .sessionId,
        studentId:
          identifiers.data
            .studentId,
      });

    const analytics =
      await getStudentAttendanceAnalytics({
        schoolId:
          access.school.id,
        schoolTimezone:
          access.school.timezone,
        branchId:
          assignment.branch_id,
        studentId:
          identifiers.data
            .studentId,
        academicSessionId:
          identifiers.data
            .sessionId,
        academicTermId:
          identifiers.data
            .termId,
      });

    if (
      !analytics
    ) {
      return NextResponse.json(
        {
          message:
            "Attendance analytics were not found for this student, class and academic period.",
        },
        {
          status:
            404,
          headers:
            teacherMyClassNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      analytics,
      {
        headers:
          teacherMyClassNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      teacherMyClassErrorResponse(
        error,
      );

    if (
      response
    ) {
      return response;
    }

    throw error;
  }
}
