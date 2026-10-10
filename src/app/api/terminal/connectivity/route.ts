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

export const dynamic =
  "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  const startedAt =
    Date.now();

  const access =
    await authenticateTerminalRequest(
      request,
      {
        touch: false,
      },
    );

  if (!access) {
    return terminalUnauthorizedResponse();
  }

  return NextResponse.json(
    {
      ok: true,
      serverTime:
        new Date().toISOString(),
      terminalId:
        access.terminal.id,
      processingMs:
        Date.now() -
        startedAt,
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}
