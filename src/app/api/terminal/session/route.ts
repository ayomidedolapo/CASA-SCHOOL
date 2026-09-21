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

  const readiness =
    getTerminalAttendanceReadiness(
      resolved,
      {
        // A closed campus session may still accept an explicitly
        // authorized late-stay checkout. The scan endpoint performs
        // the student-specific authorization check.
        allowClosedForLateStay:
          true,
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
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}
