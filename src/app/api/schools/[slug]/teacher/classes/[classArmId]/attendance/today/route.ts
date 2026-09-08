import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  attendanceNoStoreHeaders,
} from "@/server/attendance/http";
import {
  getTodayAttendanceOperations,
} from "@/server/attendance/today";
import {
  requireAssignedTeacherClass,
  requireTeacherAccess,
} from "@/server/teacher/my-class";
import {
  teacherMyClassErrorResponse,
} from "@/server/teacher/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params:
    Promise<{
      slug:
        string;
      classArmId:
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
  } =
    await context.params;

  try {
    const identifiers =
      z.object({
        classArmId:
          z.string()
            .uuid(),
      }).safeParse({
        classArmId,
      });

    if (
      !identifiers.success
    ) {
      return NextResponse.json(
        {
          message:
            "A valid classArmId is required.",
        },
        {
          status:
            400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const access =
      await requireTeacherAccess(
        slug,
      );

    const assignment =
      await requireAssignedTeacherClass({
        access,
        classArmId:
          identifiers.data
            .classArmId,
      });

    const search =
      request.nextUrl
        .searchParams;

    const page =
      Math.max(
        1,
        Number(
          search.get(
            "page",
          ) ??
          "1",
        ) ||
          1,
      );

    const pageSize =
      Math.min(
        100,
        Math.max(
          10,
          Number(
            search.get(
              "pageSize",
            ) ??
            "25",
          ) ||
            25,
        ),
      );

    const data =
      await getTodayAttendanceOperations({
        access,
        branchId:
          assignment.branch_id,
        classArmId:
          assignment.class_arm_id,
        academicSessionId:
          assignment.academic_session_id,
        query:
          search.get(
            "q",
          ) ??
          "",
        view:
          search.get(
            "view",
          ) ??
          "ALL",
        page,
        pageSize,
      });

    return NextResponse.json(
      {
        clock:
          data.clock,
        session:
          data.session,
        policyDay:
          data.policyDay,
        class: {
          assignmentId:
            assignment.assignment_id,
          academicSessionId:
            assignment.academic_session_id,
          academicSessionName:
            assignment.academic_session_name,
          branchId:
            assignment.branch_id,
          branchName:
            assignment.branch_name,
          sectionId:
            assignment.section_id,
          sectionName:
            assignment.section_name,
          classLevelId:
            assignment.class_level_id,
          classLevelName:
            assignment.class_level_name,
          classArmId:
            assignment.class_arm_id,
          classArmName:
            assignment.class_arm_name,
        },
        summary:
          data.summary,
        page:
          data.page,
        students:
          data.students,
      },
      {
        headers:
          attendanceNoStoreHeaders,
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
