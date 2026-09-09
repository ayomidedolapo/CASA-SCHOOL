import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  attendanceNoStoreHeaders,
} from "@/server/attendance/http";
import {
  recordFirstCardAttendanceException,
  requireStudentBranchAttendanceAuthority,
  SupervisedArrivalError,
} from "@/server/attendance/supervised-arrival";
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
  verificationMethod: z.literal("FACE_EXISTING_PROFILE"),
  confirmStudentFaceMatch: z.literal(true),
});

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug, studentId } = await context.params;

  try {
    const branchAccess =
      await requireStudentBranchAttendanceAuthority(
        slug,
        studentId,
      );

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      raw = null;
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Explicit supervised confirmation of the student's existing face profile is required.",
        },
        {
          status: 400,
          headers: attendanceNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      await recordFirstCardAttendanceException({
        access: branchAccess.access,
        studentId,
        verificationMethod:
          parsed.data.verificationMethod,
      }),
      {
        status: 201,
        headers: attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth = schoolOperationsErrorResponse(error);
    if (auth) {
      return auth;
    }

    if (error instanceof SupervisedArrivalError) {
      return NextResponse.json(
        {
          message: error.message,
          code: error.code,
        },
        {
          status: error.status,
          headers: attendanceNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}
