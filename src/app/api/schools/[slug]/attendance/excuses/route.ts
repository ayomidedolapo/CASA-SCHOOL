import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  createAttendanceExcuse,
  listAttendanceExcuses,
  requireBranchAccess,
  revokeAttendanceExcuse,
} from "@/server/school-operations/operations";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

const mutationSchema =
  z.discriminatedUnion(
    "action",
    [
      z.object({
        action: z.literal("CREATE"),
        branchId: z.string().uuid(),
        studentId: z.string().uuid(),
        startsOn: z.string().date(),
        endsOn: z.string().date(),
        reason:
          z.string().trim().min(3).max(1000),
      }),
      z.object({
        action: z.literal("REVOKE"),
        branchId: z.string().uuid(),
        excuseId: z.string().uuid(),
      }),
    ],
  );

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } = await context.params;

  try {
    const branchId =
      request.nextUrl.searchParams.get(
        "branchId",
      );
    const startsOn =
      request.nextUrl.searchParams.get(
        "startsOn",
      );
    const endsOn =
      request.nextUrl.searchParams.get(
        "endsOn",
      );

    if (
      !branchId ||
      !startsOn ||
      !endsOn
    ) {
      return NextResponse.json(
        {
          message:
            "branchId, startsOn and endsOn are required.",
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const branchAccess =
      await requireBranchAccess(
        slug,
        branchId,
      );

    const excuses =
      await listAttendanceExcuses({
        schoolId:
          branchAccess.access.school.id,
        branchId,
        startsOn,
        endsOn,
        includeRevoked:
          request.nextUrl.searchParams.get(
            "includeRevoked",
          ) === "true",
      });

    return NextResponse.json(
      { excuses },
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
    const body =
      mutationSchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid attendance excuse request.",
          issues: body.error.issues,
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const branchAccess =
      await requireBranchAccess(
        slug,
        body.data.branchId,
      );

    if (
      body.data.action ===
        "CREATE"
    ) {
      const excuse =
        await createAttendanceExcuse({
          access: branchAccess.access,
          branchId:
            body.data.branchId,
          studentId:
            body.data.studentId,
          startsOn:
            body.data.startsOn,
          endsOn:
            body.data.endsOn,
          reason:
            body.data.reason,
        });

      return NextResponse.json(
        { excuse },
        {
          status: 201,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const excuse =
      await revokeAttendanceExcuse({
        access: branchAccess.access,
        branchId:
          body.data.branchId,
        excuseId:
          body.data.excuseId,
      });

    return NextResponse.json(
      { excuse },
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
