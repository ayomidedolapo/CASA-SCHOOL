import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  createBranch,
  listVisibleBranches,
  requireOrganizationAdmin,
} from "@/server/school-operations/operations";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

const createSchema = z.object({
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
    .nullable()
    .optional(),
});

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { slug } = await context.params;

  try {
    const result =
      await listVisibleBranches(slug);

    return NextResponse.json(
      {
        branches: result.branches,
        organizationAdmin:
          result.organizationAdmin,
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

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } = await context.params;

  try {
    const access =
      await requireOrganizationAdmin(slug);
    const body =
      createSchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid branch details.",
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
      await createBranch({
        access,
        name: body.data.name,
        code: body.data.code,
        address:
          body.data.address ?? null,
      });

    return NextResponse.json(
      { branch },
      {
        status: 201,
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
