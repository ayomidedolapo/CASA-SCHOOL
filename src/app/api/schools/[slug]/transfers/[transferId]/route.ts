import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  registryAuthErrorResponse,
  registryNoStoreHeaders,
  requireRegistryAdmin,
} from "@/server/registry/http";
import {
  requireBranchAccess,
} from "@/server/school-operations/operations";
import {
  schoolOperationsErrorResponse,
} from "@/server/school-operations/http";
import {
  cancelStudentBranchTransfer,
  confirmStudentBranchTransfer,
  getBranchTransferScope,
  rejectStudentBranchTransfer,
} from "@/server/school-operations/transfers";

export const dynamic =
  "force-dynamic";

const bodySchema =
  z.discriminatedUnion(
    "action",
    [
      z.object({
        action:
          z.literal(
            "CONFIRM",
          ),
        targetClassArmId:
          z.string().uuid(),
      }),
      z.object({
        action:
          z.literal(
            "REJECT",
          ),
      }),
      z.object({
        action:
          z.literal(
            "CANCEL",
          ),
      }),
    ],
  );

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      slug: string;
      transferId: string;
    }>;
  },
) {
  const {
    slug,
    transferId,
  } = await context.params;

  try {
    const registryAccess =
      await requireRegistryAdmin(
        slug,
      );
    const scope =
      await getBranchTransferScope(
        registryAccess.school.id,
        transferId,
      );

    if (!scope) {
      return NextResponse.json(
        {
          message:
            "Transfer request not found.",
        },
        {
          status: 404,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const body =
      bodySchema.safeParse(
        await request
          .json()
          .catch(() => null),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid transfer decision.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    if (
      body.data.action ===
      "CONFIRM"
    ) {
      const branch =
        await requireBranchAccess(
          slug,
          scope.target_branch_id,
        );
      const result =
        await confirmStudentBranchTransfer({
          access:
            branch.access,
          transferId,
          targetClassArmId:
            body.data.targetClassArmId,
        });

      return NextResponse.json(
        {
          result,
          confirmed:
            true,
        },
        {
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    if (
      body.data.action ===
      "REJECT"
    ) {
      const branch =
        await requireBranchAccess(
          slug,
          scope.target_branch_id,
        );
      const result =
        await rejectStudentBranchTransfer({
          access:
            branch.access,
          transferId,
        });

      return NextResponse.json(
        {
          result,
          rejected:
            true,
        },
        {
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const branch =
      await requireBranchAccess(
        slug,
        scope.source_branch_id,
      );
    const result =
      await cancelStudentBranchTransfer({
        access:
          branch.access,
        transferId,
      });

    return NextResponse.json(
      {
        result,
        cancelled:
          true,
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      registryAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    const operational =
      schoolOperationsErrorResponse(
        error,
      );

    if (operational) {
      return operational;
    }

    throw error;
  }
}
