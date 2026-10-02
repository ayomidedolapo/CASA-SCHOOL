import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params:
    Promise<{
      batchId: string;
    }>;
}

export async function POST(
  request: NextRequest,
  _context: RouteContext,
) {
  const auth =
    requireInternalCardProduction(
      request,
    );

  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json(
    {
      message:
        "Routine card renewal is disabled under the CASA permanent-card policy.",
      code:
        "PERMANENT_CARD_POLICY",
    },
    {
      status: 410,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
