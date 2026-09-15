import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  SchoolAccessDeniedError,
} from "@/server/auth/authorization";
import {
  BulkCardActivationError,
  activateBranchReadyCardsBulk,
  getBranchBulkCardActivationReadiness,
} from "@/server/card-production/bulk-activation";
import {
  listVisibleBranches,
  requireBranchAccess,
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

const bodySchema = z.object({
  branchId:
    z.string().uuid(),
  confirmPhysicalHandover:
    z.literal(true),
  reason:
    z.string()
      .trim()
      .min(3)
      .max(240)
      .optional()
      .nullable(),
});

interface VisibleBranch {
  id: string;
  name: string;
  code: string;
  is_headquarters: boolean;
  status: "ACTIVE" | "INACTIVE";
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
  } = await context.params;

  try {
    const visibility =
      await listVisibleBranches(
        slug,
      );

    const visibleBranches =
      (
        visibility.branches as
          VisibleBranch[]
      ).filter(
        (branch) =>
          branch.status ===
          "ACTIVE",
      );

    const branchRows =
      await Promise.all(
        visibleBranches.map(
          async (branch) => {
            if (
              !visibility
                .organizationAdmin
            ) {
              try {
                await requireBranchAccess(
                  slug,
                  branch.id,
                );
              } catch (error) {
                if (
                  error instanceof
                  SchoolAccessDeniedError
                ) {
                  return null;
                }

                throw error;
              }
            }

            return {
              id: branch.id,
              name: branch.name,
              code: branch.code,
              isHeadquarters:
                branch.is_headquarters,
              readiness:
                await getBranchBulkCardActivationReadiness({
                  access:
                    visibility.access,
                  branchId:
                    branch.id,
                }),
            };
          },
        ),
      );

    const branches =
      branchRows.filter(
        (branch): branch is
          NonNullable<
            typeof branch
          > => Boolean(branch),
      );

    return NextResponse.json(
      {
        organizationAdmin:
          visibility.organizationAdmin,
        branches,
      },
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      schoolOperationsErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    throw error;
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
  } = await context.params;

  try {
    const body =
      await request.json()
        .catch(() => null);
    const parsed =
      bodySchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Choose one campus and explicitly confirm physical handover before bulk activation.",
          code:
            "CARD_BULK_ACTIVATION_INPUT_INVALID",
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const authority =
      await requireBranchAccess(
        slug,
        parsed.data.branchId,
      );

    const result =
      await activateBranchReadyCardsBulk({
        access:
          authority.access,
        branchId:
          authority.branch.id,
        stepUpToken:
          request.headers.get(
            "x-casa-passkey-step-up",
          ),
        reason:
          parsed.data.reason ??
          null,
      });

    return NextResponse.json(
      {
        branch: {
          id:
            authority.branch.id,
          name:
            authority.branch.name,
          isHeadquarters:
            authority.branch.is_headquarters,
        },
        ...result,
      },
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      schoolOperationsErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    if (
      error instanceof
      BulkCardActivationError
    ) {
      return NextResponse.json(
        {
          message:
            error.message,
          code:
            error.code,
        },
        {
          status:
            error.status,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}
