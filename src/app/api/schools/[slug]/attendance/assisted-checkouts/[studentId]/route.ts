import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  attendanceNoStoreHeaders,
} from "@/server/attendance/http";
import {
  AssistedCheckoutError,
  recordAssistedCheckout,
} from "@/server/attendance/assisted-checkout";
import {
  requireStudentBranchAttendanceAuthority,
} from "@/server/attendance/supervised-arrival";
import {
  schoolOperationsErrorResponse,
} from "@/server/school-operations/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
  }>;
}

const bodySchema =
  z.object({
    reason:
      z.string()
        .trim()
        .min(3)
        .max(240),
    confirmStudentFaceMatch:
      z.literal(true),
  });

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
  } =
    await context.params;

  try {
    const branchAccess =
      await requireStudentBranchAttendanceAuthority(
        slug,
        studentId,
      );

    const parsed =
      bodySchema.safeParse(
        await request
          .json()
          .catch(
            () => null,
          ),
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "A sign-out reason and explicit face-match confirmation are required.",
          code:
            "ASSISTED_CHECKOUT_DETAILS_REQUIRED",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const result =
      await recordAssistedCheckout({
        access:
          branchAccess.access,
        studentId,
        reason:
          parsed.data.reason,
        confirmStudentFaceMatch:
          parsed.data.confirmStudentFaceMatch,
        stepUpToken:
          request.headers.get(
            "x-casa-passkey-step-up",
          ),
      });

    return NextResponse.json(
      result,
      {
        status: 201,
        headers:
          attendanceNoStoreHeaders,
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
      AssistedCheckoutError
    ) {
      return NextResponse.json(
        {
          message:
            error.message,
          code:
            error.code,
          requiredAction:
            error.code ===
              "PASSKEY_STEP_UP_REQUIRED"
              ? "ASSISTED_CHECK_OUT"
              : undefined,
        },
        {
          status:
            error.status,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}
