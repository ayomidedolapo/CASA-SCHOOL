import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getCurrentCalendarClosure,
} from "@/server/school-operations/calendar-closure";
import {
  listVisibleBranches,
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
      await listVisibleBranches(
        slug,
      );
    const requestedBranchId =
      request.nextUrl
        .searchParams
        .get(
          "branchId",
        );
    const visibleBranchIds =
      (
        visibility.branches as
          Array<{
            id: string;
          }>
      ).map(
        (branch) =>
          String(
            branch.id,
          ),
      );

    if (
      requestedBranchId &&
      !visibleBranchIds.includes(
        requestedBranchId,
      )
    ) {
      return NextResponse.json(
        {
          message:
            "This campus is outside your current school access.",
          code:
            "CALENDAR_BRANCH_ACCESS_DENIED",
        },
        {
          status:
            403,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const closure =
      await getCurrentCalendarClosure({
        schoolId:
          visibility.access.school.id,
        timezone:
          visibility.access.school.timezone,
        branchIds:
          requestedBranchId
            ? [
                requestedBranchId,
              ]
            : visibleBranchIds,
      });

    return NextResponse.json(
      {
        closure,
      },
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
