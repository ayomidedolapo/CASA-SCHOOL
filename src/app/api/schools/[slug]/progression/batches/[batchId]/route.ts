import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  z,
} from "zod";

import {
  requireSchoolAccess,
} from "@/server/auth/authorization";
import {
  requireBranchAccess,
} from "@/server/school-operations/operations";
import {
  cancelProgressionBatch,
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

const mutationSchema =
  z.object({
    action:
      z.literal(
        "CANCEL",
      ),
  });

export async function GET(
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

    await requireBranchAccess(
      slug,
      batch.branch_id,
    );

    return NextResponse.json(
      {
        batch,
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

export async function PATCH(
  request: NextRequest,
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

    const body =
      mutationSchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid progression batch action.",
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const updated =
      await cancelProgressionBatch({
        access:
          branchAccess.access,
        batchId,
      });

    return NextResponse.json(
      {
        batch:
          updated,
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
