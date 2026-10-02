import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: NextRequest,
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
        "Routine card renewal is disabled. CASA permanent cards remain valid until graduation or exit unless lost, damaged or revoked.",
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
