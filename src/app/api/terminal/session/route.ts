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
  getActiveTerminalSession,
} from "@/server/attendance/terminal-session";

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
    await getActiveTerminalSession(
      access.school.id,
      access.school.timezone,
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
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}