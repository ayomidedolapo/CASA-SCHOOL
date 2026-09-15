import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  preauthorizeEarlyDepartures,
} from "@/server/attendance/early-departure";
import {
  attendanceAuthErrorResponse,
  attendanceNoStoreHeaders,
} from "@/server/attendance/http";
import {
  requireSchoolAccess,
} from "@/server/auth/authorization";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

const bodySchema =
  z.object({
    branchId:
      z.string()
        .uuid(),
    studentIds:
      z.array(
        z.string().uuid(),
      )
        .min(1)
        .max(100),
    reason:
      z.string()
        .trim()
        .min(3)
        .max(240),
  });

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const access =
      await requireSchoolAccess(
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
            "Invalid early-departure selection.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const body =
      bodySchema.safeParse(
        raw,
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Select one or more on-campus students, one branch, and a clear reason.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const result =
      await preauthorizeEarlyDepartures({
        access,
        branchId:
          body.data.branchId,
        studentIds:
          body.data.studentIds,
        reason:
          body.data.reason,
        stepUpToken:
          request.headers.get(
            "x-casa-passkey-step-up",
          ),
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            result.code ===
              "EARLY_DEPARTURE_STUDENT_NOT_ELIGIBLE"
              ? "Every selected student must currently be on campus in the selected branch."
              : "Selected students could not be authorized for early departure.",
          code:
            result.code,
          requiredAction:
            "requiredAction" in
              result
              ? result.requiredAction
              : undefined,
          studentId:
            "studentId" in
              result
              ? result.studentId
              : undefined,
        },
        {
          status:
            result.status,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      result,
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      attendanceAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}
