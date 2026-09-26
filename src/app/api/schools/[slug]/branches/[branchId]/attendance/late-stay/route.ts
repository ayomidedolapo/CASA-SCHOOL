import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { attendanceNoStoreHeaders } from "@/server/attendance/http";
import { authorizeLateStay } from "@/server/attendance/late-stay";
import { requireBranchAttendanceOperatorAccess } from "@/server/school-operations/operations";
import { schoolOperationsErrorResponse } from "@/server/school-operations/http";

export const dynamic = "force-dynamic";
interface RouteContext { params: Promise<{ slug: string; branchId: string }>; }
const bodySchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().trim().min(3).max(240),
  allowedUntil: z.string().datetime({ offset: true }),
});

export async function POST(request: NextRequest, context: RouteContext) {
  const { slug, branchId } = await context.params;
  try {
    const branchAccess = await requireBranchAttendanceOperatorAccess(slug, branchId);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid late-stay authorization request." }, { status: 400, headers: attendanceNoStoreHeaders });
    }
    const result = await authorizeLateStay({
      access: branchAccess.access,
      branchId,
      studentIds: parsed.data.studentIds,
      reason: parsed.data.reason,
      allowedUntil: parsed.data.allowedUntil,
      stepUpToken: request.headers.get("x-casa-passkey-step-up"),
    });
    if (!result.ok) {
      return NextResponse.json({ message: "Late-stay authorization could not be completed.", code: result.code, ...("requiredAction" in result ? { requiredAction: result.requiredAction } : {}) }, { status: result.status, headers: attendanceNoStoreHeaders });
    }
    return NextResponse.json(result, { headers: attendanceNoStoreHeaders });
  } catch (error) {
    const response = schoolOperationsErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
