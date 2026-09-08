import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  assignTerminalToBranch,
  getBranchOperationalView,
  requireBranchAccess,
  requireOrganizationAdmin,
  setBranchClassArms,
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

const schema = z.discriminatedUnion(
  "action",
  [
    z.object({
      action:
        z.literal("SET_CLASS_ARMS"),
      classArmIds:
        z.array(z.string().uuid()),
    }),
    z.object({
      action:
        z.literal("ASSIGN_TERMINAL"),
      terminalId:
        z.string().uuid(),
    }),
  ],
);

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
      view,
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
            "Invalid branch structure request.",
          issues: body.error.issues,
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    if (
      body.data.action ===
      "SET_CLASS_ARMS"
    ) {
      const result =
        await setBranchClassArms({
          access,
          branchId,
          classArmIds:
            body.data.classArmIds,
        });

      return NextResponse.json(
        result,
        {
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const assignment =
      await assignTerminalToBranch({
        access,
        branchId,
        terminalId:
          body.data.terminalId,
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
