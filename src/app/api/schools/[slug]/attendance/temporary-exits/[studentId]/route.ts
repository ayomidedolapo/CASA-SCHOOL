import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  attendanceNoStoreHeaders,
} from "@/server/attendance/http";
import {
  requireStudentBranchAttendanceAuthority,
} from "@/server/attendance/supervised-arrival";
import {
  authorizeTemporaryExit,
  TemporaryExitError,
} from "@/server/attendance/temporary-exit";
import {
  schoolOperationsErrorResponse,
} from "@/server/school-operations/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
  }>;
}

const bodySchema = z.object({
  reason: z.string().trim().min(3).max(240),
});

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug, studentId } =
    await context.params;

  try {
    const branchAccess =
      await requireStudentBranchAttendanceAuthority(
        slug,
        studentId,
      );

    const parsed =
      bodySchema.safeParse(
        await request.json().catch(() => null),
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "A temporary step-out reason between 3 and 240 characters is required.",
          code:
            "TEMPORARY_EXIT_REASON_REQUIRED",
        },
        {
          status: 400,
          headers: attendanceNoStoreHeaders,
        },
      );
    }

    const result =
      await authorizeTemporaryExit({
        access: branchAccess.access,
        branchId: branchAccess.branch.id,
        studentId,
        reason: parsed.data.reason,
        stepUpToken:
          request.headers.get(
            "x-casa-passkey-step-up",
          ),
      });

    return NextResponse.json(
      {
        temporaryExit: result,
        message:
          "Temporary step-out authorized. One authorization covers the student's verified step-out and verified return.",
      },
      {
        status: 201,
        headers: attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      schoolOperationsErrorResponse(error);
    if (auth) return auth;

    if (error instanceof TemporaryExitError) {
      return NextResponse.json(
        {
          message: error.message,
          code: error.code,
          requiredAction:
            error.code === "PASSKEY_STEP_UP_REQUIRED"
              ? "TEMPORARY_EXIT"
              : undefined,
        },
        {
          status: error.status,
          headers: attendanceNoStoreHeaders,
        },
      );
    }

    console.error(
      "TEMPORARY_EXIT_AUTHORIZATION_UNEXPECTED",
      error,
    );

    return NextResponse.json(
      {
        message:
          "CASA could not authorize the temporary student step-out.",
        code:
          "TEMPORARY_EXIT_INTERNAL_ERROR",
      },
      {
        status: 500,
        headers: attendanceNoStoreHeaders,
      },
    );
  }
}
