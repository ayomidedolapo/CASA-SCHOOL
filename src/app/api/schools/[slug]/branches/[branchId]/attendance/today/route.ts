import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  attendanceNoStoreHeaders,
} from "@/server/attendance/http";
import {
  getTodayAttendanceOperations,
} from "@/server/attendance/today";
import {
  requireBranchAccess,
} from "@/server/school-operations/operations";
import {
  schoolOperationsErrorResponse,
} from "@/server/school-operations/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    branchId: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    branchId,
  } =
    await context.params;

  try {
    const branchAccess =
      await requireBranchAccess(
        slug,
        branchId,
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
            "25",
          ) ||
            25,
        ),
      );

    const data =
      await getTodayAttendanceOperations({
        access:
          branchAccess.access,
        branchId,
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
      data,
      {
        headers:
          attendanceNoStoreHeaders,
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
