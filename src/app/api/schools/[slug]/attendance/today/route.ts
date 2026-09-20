import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  attendanceAuthErrorResponse,
  attendanceNoStoreHeaders,
  requireAttendanceOperator,
} from "@/server/attendance/http";
import {
  getTodayAttendanceOperations,
} from "@/server/attendance/today";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
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
  } =
    await context.params;

  try {
    const access =
      await requireAttendanceOperator(
        slug,
      );

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
              "50",
          ) ||
            50,
        ),
      );

    const result =
      await getTodayAttendanceOperations({
        access,
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
        date:
          search.get(
            "date",
          ),
      });

    return NextResponse.json(
      result,
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      attendanceAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}