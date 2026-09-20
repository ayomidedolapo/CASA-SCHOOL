import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { attendanceNoStoreHeaders } from "@/server/attendance/http";
import { rebindBranchAttendanceSessionPolicy } from "@/server/attendance/branch-session";
import { consumePasskeyStepUpGrantWithId } from "@/server/auth/passkey-step-up";
import { requireBranchAccess } from "@/server/school-operations/operations";
import { schoolOperationsErrorResponse } from "@/server/school-operations/http";

export const dynamic = "force-dynamic";
interface RouteContext { params: Promise<{ slug: string; branchId: string }>; }
const bodySchema = z.object({ reason: z.string().trim().min(8).max(240) });

export async function POST(request: NextRequest, context: RouteContext) {
  const { slug, branchId } = await context.params;
  try {
    const branchAccess = await requireBranchAccess(slug, branchId);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ message: "A correction reason is required." }, { status: 400, headers: attendanceNoStoreHeaders });
    }
    const token = request.headers.get("x-casa-passkey-step-up");
    const grantId = token ? await consumePasskeyStepUpGrantWithId({
      token,
      access: branchAccess.access,
      action: "ATTENDANCE_SESSION_POLICY_REBIND",
    }) : null;
    if (!grantId) {
      return NextResponse.json({ message: "Passkey authorization is required to change the active attendance policy.", code: "PASSKEY_STEP_UP_REQUIRED", requiredAction: "ATTENDANCE_SESSION_POLICY_REBIND" }, { status: 403, headers: attendanceNoStoreHeaders });
    }
    const result = await rebindBranchAttendanceSessionPolicy({ access: branchAccess.access, branchId, reason: parsed.data.reason, passkeyGrantId: grantId });
    if (!result.ok) {
      return NextResponse.json({ message: "Attendance policy correction could not be completed.", code: result.code }, { status: result.status, headers: attendanceNoStoreHeaders });
    }
    return NextResponse.json(result, { headers: attendanceNoStoreHeaders });
  } catch (error) {
    const response = schoolOperationsErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
