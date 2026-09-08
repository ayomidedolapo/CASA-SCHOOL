import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  getBranchOperationalView,
  requireBranchAccess,
  requireOrganizationAdmin,
  updateBranch,
} from "@/server/school-operations/operations";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    branchId: string;
  }>;
}

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/),
  address: z
    .string()
    .trim()
    .max(500)
    .nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { slug, branchId } =
    await context.params;

  try {
    const branchAccess =
      await requireBranchAccess(
        slug,
        branchId,
      );
    const view =
      await getBranchOperationalView(
        branchAccess.access.school.id,
        branchId,
      );

    return NextResponse.json(
      {
        branch: branchAccess.branch,
        organizationAdmin:
          branchAccess.organizationAdmin,
        ...view,
      },
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      schoolOperationsErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug, branchId } =
    await context.params;

  try {
    const access =
      await requireOrganizationAdmin(slug);
    const body =
      updateSchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid branch update.",
          issues: body.error.issues,
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const branch =
      await updateBranch({
        access,
        branchId,
        ...body.data,
      });

    return NextResponse.json(
      { branch },
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      schoolOperationsErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
