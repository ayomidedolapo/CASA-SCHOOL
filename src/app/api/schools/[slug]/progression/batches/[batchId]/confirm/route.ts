import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireSchoolAccess,
} from "@/server/auth/authorization";
import {
  requireBranchAccess,
} from "@/server/school-operations/operations";
import {
  confirmProgressionBatch,
  getProgressionBatchScope,
} from "@/server/school-operations/progression";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    batchId: string;
  }>;
}

export async function POST(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    batchId,
  } =
    await context.params;

  try {
    const schoolAccess =
      await requireSchoolAccess(
        slug,
      );

    const batch =
      await getProgressionBatchScope(
        schoolAccess.school.id,
        batchId,
      );

    if (!batch) {
      return NextResponse.json(
        {
          message:
            "Progression batch not found.",
        },
        {
          status: 404,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const branchAccess =
      await requireBranchAccess(
        slug,
        batch.branch_id,
      );

    const result =
      await confirmProgressionBatch({
        access:
          branchAccess.access,
        batchId,
      });

    return NextResponse.json(
      {
        result,
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
