import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  assignBranchAdministrator,
  listBranchAdministrators,
  requireOrganizationAdmin,
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

const schema = z.object({
  membershipId: z.string().uuid(),
  active: z.boolean().default(true),
});

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { slug, branchId } =
    await context.params;

  try {
    const access =
      await requireOrganizationAdmin(slug);
    const administrators =
      await listBranchAdministrators(
        access.school.id,
        branchId,
      );

    return NextResponse.json(
      { administrators },
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

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug, branchId } =
    await context.params;

  try {
    const access =
      await requireOrganizationAdmin(slug);
    const body =
      schema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid branch administrator assignment.",
          issues: body.error.issues,
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const assignment =
      await assignBranchAdministrator({
        access,
        branchId,
        membershipId:
          body.data.membershipId,
        active: body.data.active,
      });

    return NextResponse.json(
      { assignment },
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
