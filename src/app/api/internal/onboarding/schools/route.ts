import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireCasaInternalAccess,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";
import {
  listCasaInternalSchools,
} from "@/server/internal/onboarding";

export const dynamic =
  "force-dynamic";

export async function GET(
  _request: NextRequest,
) {
  try {
    const access =
      await requireCasaInternalAccess();

    return NextResponse.json(
      {
        schools:
          await listCasaInternalSchools(
            access,
          ),
      },
      {
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      casaInternalAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}
