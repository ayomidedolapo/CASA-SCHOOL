import { NextResponse } from "next/server";

import { probeCardTextRuntime } from "@/server/card-production/render";
import { requireCasaCapability } from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCasaCapability("CARD_PRODUCTION_ADMIN");

    const probe =
      await probeCardTextRuntime();

    return NextResponse.json(
      {
        healthy:
          probe.healthy,
        renderer:
          "sharp-svg-generic-sans",
        sampleABytes:
          probe.sampleABytes,
        sampleBBytes:
          probe.sampleBBytes,
      },
      {
        status:
          probe.healthy
            ? 200
            : 503,
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

    return NextResponse.json(
      {
        healthy: false,
        message:
          "Card text renderer health probe failed.",
      },
      {
        status: 503,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  }
}
