import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";
import {
  requireOrganizationAdmin,
} from "@/server/school-operations/operations";
import {
  correctBranchDetails,
} from "@/server/school-operations/structure-correction";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    branchId: string;
  }>;
}

const schema =
  z.object({
    name:
      z.string()
        .trim()
        .min(2)
        .max(160),
    code:
      z.string()
        .trim()
        .min(1)
        .max(40),
    address:
      z.string()
        .trim()
        .max(300)
        .optional()
        .nullable(),
    reason:
      z.string()
        .trim()
        .min(3)
        .max(240),
  });

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    branchId,
  } = await context.params;

  try {
    const access =
      await requireOrganizationAdmin(
        slug,
      );

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid branch correction request.",
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const parsed =
      schema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid branch correction request.",
          issues:
            parsed.error.issues,
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const branch =
      await correctBranchDetails({
        access,
        branchId,
        ...parsed.data,
        address:
          parsed.data.address ??
          null,
      });

    return NextResponse.json(
      {
        branch,
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
