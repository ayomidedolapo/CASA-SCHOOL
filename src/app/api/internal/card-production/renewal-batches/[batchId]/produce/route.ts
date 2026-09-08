import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";
import {
  produceStudentCardRenewalBatch,
} from "@/server/card-production/renewal-production";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params:
    Promise<{
      batchId:
        string;
    }>;
}

const bodySchema =
  z.object({
    limit:
      z.number()
        .int()
        .min(1)
        .max(500)
        .default(100),
  });

export async function POST(
  request:
    NextRequest,
  context:
    RouteContext,
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
  } = await context.params;

  let raw: unknown =
    {};

  try {
    raw =
      await request.json();
  } catch {
    raw = {};
  }

  const body =
    bodySchema.safeParse(
      raw,
    );

  if (!body.success) {
    return NextResponse.json(
      {
        message:
          "Invalid renewal production request.",
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

  const result =
    await produceStudentCardRenewalBatch({
      batchId,
      origin:
        request.nextUrl.origin,
      limit:
        body.data.limit,
    });

  if (!result.ok) {
    return NextResponse.json(
      {
        message:
          "Renewal batch could not be produced.",
        code:
          result.code,
      },
      {
        status:
          result.status,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const firstFailure =
    result.results.find(
      (item) =>
        !item.ok,
    );

  return NextResponse.json(
    {
      batchId:
        result.batchId,
      requested:
        result.requested,
      produced:
        result.results.filter(
          (item) =>
            item.ok,
        ).length,
      allRequestedSucceeded:
        result.allRequestedSucceeded,
      failure:
        firstFailure ??
        null,
      results:
        result.results,
    },
    {
      status:
        firstFailure
          ? 409
          : 200,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
