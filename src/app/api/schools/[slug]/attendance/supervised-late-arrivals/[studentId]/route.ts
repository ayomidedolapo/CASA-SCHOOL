import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  attendanceNoStoreHeaders,
} from "@/server/attendance/http";
import {
  recordSupervisedLateArrival,
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
  reason: z.string().trim().min(3).max(240),
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
            "A supervised late-arrival reason between 3 and 240 characters is required.",
        },
        {
          status: 400,
          headers: attendanceNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      await recordSupervisedLateArrival({
        access: branchAccess.access,
        studentId,
        reason: parsed.data.reason,
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
