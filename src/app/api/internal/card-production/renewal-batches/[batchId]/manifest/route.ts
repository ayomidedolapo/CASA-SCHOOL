import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";
import {
  buildCardRenewalManifest,
} from "@/server/card-production/renewal-manifest";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    batchId: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const auth =
    requireInternalCardProduction(
      request,
    );

  if (!auth.ok) {
    return auth.response;
  }

  const {
    batchId,
  } =
    await context.params;

  if (
    !z.string()
      .uuid()
      .safeParse(
        batchId,
      )
      .success
  ) {
    return NextResponse.json(
      {
        message:
          "Invalid renewal batch id.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const manifest =
    await buildCardRenewalManifest(
      batchId,
    );

  if (!manifest) {
    return NextResponse.json(
      {
        message:
          "Card renewal batch not found.",
      },
      {
        status: 404,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  return new NextResponse(
    new Uint8Array(
      manifest.bytes,
    ),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          `attachment; filename="casa-card-renewal-${batchId}.xlsx"`,
        "Cache-Control":
          "no-store",
      },
    },
  );
}
