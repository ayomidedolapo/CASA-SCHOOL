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
  getStudentBranchTransferSourceScope,
  requestStudentBranchTransfer,
} from "@/server/school-operations/transfers";

export const dynamic =
  "force-dynamic";

const bodySchema =
  z.object({
    targetBranchId:
      z.string().uuid(),
    reason:
      z.string()
        .trim()
        .max(1000)
        .nullable()
        .optional(),
  });

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      slug: string;
      studentId: string;
    }>;
  },
) {
  const {
    slug,
    studentId,
  } = await context.params;

  try {
    const registryAccess =
      await requireRegistryAdmin(
        slug,
      );
    const source =
      await getStudentBranchTransferSourceScope({
        schoolId:
          registryAccess.school.id,
        studentId,
      });

    if (!source) {
      return NextResponse.json(
        {
          message:
            "The student does not have an active branch enrollment available for transfer.",
        },
        {
          status: 409,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const branchAccess =
      await requireBranchAccess(
        slug,
        source.source_branch_id,
      );
    const parsed =
      bodySchema.safeParse(
        await request
          .json()
          .catch(() => null),
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Choose a valid destination branch.",
          issues:
            parsed.error.issues,
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const transfer =
      await requestStudentBranchTransfer({
        access:
          branchAccess.access,
        studentId,
        sourceBranchId:
          source.source_branch_id,
        sourceEnrollmentId:
          source.source_enrollment_id,
        targetBranchId:
          parsed.data.targetBranchId,
        reason:
          parsed.data.reason ??
          null,
      });

    return NextResponse.json(
      {
        transfer,
        suspended:
          true,
        message:
          "Transfer request sent. Attendance-terminal use is suspended until the destination branch confirms or rejects it.",
      },
      {
        status: 201,
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
