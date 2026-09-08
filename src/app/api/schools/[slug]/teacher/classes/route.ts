import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  listTeacherClasses,
  requireTeacherAccess,
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
      await requireTeacherAccess(
        slug,
      );

    const classes =
      await listTeacherClasses(
        access,
      );

    return NextResponse.json(
      {
        classes,
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
