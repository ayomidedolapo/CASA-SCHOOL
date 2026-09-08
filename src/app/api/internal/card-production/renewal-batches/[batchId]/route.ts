import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";
import {
  getRenewalBatch,
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

  const batch =
    await getRenewalBatch(
      batchId,
    );

  if (!batch) {
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

  return NextResponse.json(
    batch,
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
