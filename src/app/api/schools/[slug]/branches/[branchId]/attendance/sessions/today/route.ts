import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  closeBranchAttendanceSession,
  openBranchAttendanceSession,
  prepareBranchAttendanceSession,
  reopenBranchAttendanceSession,
} from "@/server/attendance/branch-session";
import { requirePasskeyStepUpGrant } from "@/server/auth/passkey-step-up";
import { requireBranchAccess } from "@/server/school-operations/operations";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

type Context = { params: Promise<{ slug: string; branchId: string }> };

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PREPARE"), mode: z.enum(["INSTRUCTIONAL", "PRESENCE_ONLY"]) }),
  z.object({ action: z.literal("OPEN") }),
  z.object({ action: z.literal("CLOSE") }),
  z.object({ action: z.literal("REOPEN"), reason: z.string().trim().min(8).max(240) }),
]);

export async function POST(request: NextRequest, context: Context) {
  const { slug, branchId } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Choose a valid attendance session action." },
      { status: 400, headers: schoolOperationsNoStoreHeaders },
    );
  }

  try {
    const { access } = await requireBranchAccess(slug, branchId);

    if (parsed.data.action === "REOPEN") {
      await requirePasskeyStepUpGrant({
        token: request.headers.get("x-casa-passkey-step-up"),
        access,
        action: "ATTENDANCE_SESSION_REOPEN",
      });
    }

    const result =
      parsed.data.action === "PREPARE"
        ? await prepareBranchAttendanceSession({ access, branchId, mode: parsed.data.mode })
        : parsed.data.action === "OPEN"
          ? await openBranchAttendanceSession({ access, branchId })
          : parsed.data.action === "CLOSE"
            ? await closeBranchAttendanceSession({ access, branchId })
            : await reopenBranchAttendanceSession({ access, branchId, reason: parsed.data.reason });

    if (!result.ok) {
      return NextResponse.json(
        { message: result.code, code: result.code },
        { status: result.status, headers: schoolOperationsNoStoreHeaders },
      );
    }
    return NextResponse.json(result, { headers: schoolOperationsNoStoreHeaders });
  } catch (error) {
    if (error instanceof Error && error.message === "PASSKEY_STEP_UP_REQUIRED") {
      return NextResponse.json(
        {
          message: "Passkey authorization is required to reopen attendance.",
          code: "PASSKEY_STEP_UP_REQUIRED",
          requiredAction: "ATTENDANCE_SESSION_REOPEN",
        },
        { status: 403, headers: schoolOperationsNoStoreHeaders },
      );
    }
    const response = schoolOperationsErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
