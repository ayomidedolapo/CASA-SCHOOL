import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  listTeacherClassAssignments,
  setTeacherClassAssignment,
} from "@/server/teacher/my-class";
import {
  teacherMyClassErrorResponse,
  teacherMyClassNoStoreHeaders,
} from "@/server/teacher/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params:
    Promise<{
      slug:
        string;
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
  } =
    await context.params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
      );

    const assignments =
      await listTeacherClassAssignments(
        access,
      );

    return NextResponse.json(
      {
        assignments,
      },
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

export async function POST(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
      );

    const body: unknown =
      await request.json();

    const parsed =
      z.object({
        membershipId:
          z.string()
            .uuid(),
        academicSessionId:
          z.string()
            .uuid(),
        classArmId:
          z.string()
            .uuid(),
        active:
          z.boolean(),
      }).safeParse(
        body,
      );

    if (
      !parsed.success
    ) {
      return NextResponse.json(
        {
          message:
            "membershipId, academicSessionId, classArmId and active are required.",
        },
        {
          status:
            400,
          headers:
            teacherMyClassNoStoreHeaders,
        },
      );
    }

    const assignment =
      await setTeacherClassAssignment({
        access,
        ...parsed.data,
      });

    return NextResponse.json(
      {
        assignment,
      },
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
