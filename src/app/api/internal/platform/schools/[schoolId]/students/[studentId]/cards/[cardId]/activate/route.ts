import {
  NextResponse,
} from "next/server";

import {
  requireCasaSuperAdmin,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

export const dynamic =
  "force-dynamic";

export async function POST(
  _request: Request,
  {
    params,
  }: {
    params:
      Promise<{
        schoolId: string;
        studentId: string;
        cardId: string;
      }>;
  },
) {
  try {
    await requireCasaSuperAdmin();
    await params;

    return NextResponse.json(
      {
        message:
          "CASA production may preview, export and print cards, but only the School/Branch Admin may confirm physical handover and activate a student card.",
        code:
          "SCHOOL_CARD_ACTIVATION_REQUIRED",
      },
      {
        status: 403,
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
