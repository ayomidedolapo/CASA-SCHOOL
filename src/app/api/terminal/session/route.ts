import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  attendanceNoStoreHeaders,
  terminalUnauthorizedResponse,
} from "@/server/attendance/http";
import {
  authenticateTerminalRequest,
} from "@/server/attendance/terminal-auth";
import {
  getTerminalAttendanceReadiness,
  getTerminalBranchAttendanceContext,
  hasActiveLateStayAuthorizationForBranchSession,
} from "@/server/attendance/branch-session";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  const access =
    await authenticateTerminalRequest(
      request,
    );

  if (!access) {
    return terminalUnauthorizedResponse();
  }

  const resolved =
    await getTerminalBranchAttendanceContext({
      schoolId:
        access.school.id,
      terminalId:
        access.terminal.id,
      timezone:
        access.school.timezone,
    });

  const lateStayOnly =
    Boolean(
      resolved.branch &&
      resolved.session
        ?.branchSessionId &&
      resolved.session
        .status ===
        "CLOSED" &&
      await hasActiveLateStayAuthorizationForBranchSession({
        schoolId:
          access.school.id,
        sessionId:
          resolved.session.id,
        branchId:
          resolved.branch.id,
      }),
    );

  const readiness =
    getTerminalAttendanceReadiness(
      resolved,
      {
        // Closed attendance normally turns the scanner off. It remains
        // available only while a real, unexpired late-stay authorization
        // exists for this campus session.
        allowClosedForLateStay:
          lateStayOnly,
      },
    );

  return NextResponse.json(
    {
      school: {
        slug:
          access.school.slug,
        name:
          access.school.name,
        timezone:
          access.school.timezone,
      },
      terminal: {
        id:
          access.terminal.id,
        name:
          access.terminal.name,
        terminalCode:
          access.terminal.terminalCode,
        credentialVersion:
          access.terminal.credentialVersion,
      },
      branch:
        resolved.branch,
      clock:
        resolved.clock,
      session:
        resolved.session
          ? {
              ...resolved.session,
              policyDay:
                resolved.policyDay,
            }
          : null,
      readiness,
      lateStayOnly,
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}
