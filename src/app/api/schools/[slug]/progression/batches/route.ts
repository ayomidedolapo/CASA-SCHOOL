import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireBranchAccess,
} from "@/server/school-operations/operations";
import {
  createProgressionBatch,
  listProgressionBatches,
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
  }>;
}

const createSchema =
  z.object({
    branchId:
      z.string().uuid(),
    sourceSessionId:
      z.string().uuid(),
    targetSessionId:
      z.string().uuid(),
  });

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

  try {
    const branchId =
      request.nextUrl.searchParams.get(
        "branchId",
      );

    const parsedBranch =
      z.string()
        .uuid()
        .safeParse(
          branchId,
        );

    if (
      !parsedBranch.success
    ) {
      return NextResponse.json(
        {
          message:
            "A valid branchId is required.",
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
        parsedBranch.data,
      );

    const batches =
      await listProgressionBatches({
        schoolId:
          branchAccess.access.school.id,
        branchId:
          parsedBranch.data,
      });

    return NextResponse.json(
      {
        batches,
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

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

  try {
    const body =
      createSchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid progression batch request.",
          issues:
            body.error.issues,
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
        body.data.branchId,
      );

    const result =
      await createProgressionBatch({
        access:
          branchAccess.access,
        branchId:
          body.data.branchId,
        sourceSessionId:
          body.data.sourceSessionId,
        targetSessionId:
          body.data.targetSessionId,
      });

    return NextResponse.json(
      result,
      {
        status:
          result.created
            ? 201
            : 200,
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
