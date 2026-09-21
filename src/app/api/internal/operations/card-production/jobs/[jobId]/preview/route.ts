import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getCurrentCardProductionPreview,
} from "@/server/card-production/live-preview";
import {
  requireCasaCapability,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

export const dynamic =
  "force-dynamic";

type Context = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(
  _request:
    NextRequest,
  context:
    Context,
) {
  try {
    await requireCasaCapability(
      "CARD_PRODUCTION_ADMIN",
    );

    const {
      jobId,
    } =
      await context.params;

    const preview =
      await getCurrentCardProductionPreview(
        jobId,
      );

    if (!preview) {
      return NextResponse.json(
        {
          message:
            "Card preview artifact is unavailable.",
        },
        {
          status: 404,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    return new NextResponse(
      new Uint8Array(
        preview,
      ),
      {
        headers: {
          "Content-Type":
            "image/png",
          "Cache-Control":
            "private, no-store",
          "Content-Disposition":
            "inline",
          "X-CASA-Card-Preview":
            "LIVE_RENDER_WITH_PRESERVED_QR",
        },
      },
    );
  } catch (
    error
  ) {
    const auth =
      casaInternalAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    return NextResponse.json(
      {
        message:
          "Card preview could not be loaded.",
      },
      {
        status: 500,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  }
}
