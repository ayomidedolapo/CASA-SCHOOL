import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";
import {
  markProductionJobPrinted,
  rotateProductionPublicLink,
} from "@/server/card-production/production";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    jobId: string;
  }>;
}

const bodySchema =
  z.object({
    action:
      z.enum([
        "MARK_PRINTED",
        "ROTATE_PUBLIC_LINK",
      ]),
    reason:
      z.string()
        .trim()
        .min(3)
        .max(240)
        .nullable()
        .optional(),
  });

export async function PATCH(
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
    jobId,
  } =
    await context.params;

  if (
    !z.string()
      .uuid()
      .safeParse(
        jobId,
      ).success
  ) {
    return NextResponse.json(
      {
        message:
          "Invalid production job ID.",
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

  let raw: unknown;

  try {
    raw =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        message:
          "Invalid production job request.",
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

  const body =
    bodySchema.safeParse(
      raw,
    );

  if (!body.success) {
    return NextResponse.json(
      {
        message:
          "Invalid production job request.",
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
    body.data.action ===
      "MARK_PRINTED"
      ? await markProductionJobPrinted({
          jobId,
          reason:
            body.data.reason ??
            null,
        })
      : await rotateProductionPublicLink({
          jobId,
          reason:
            body.data.reason ??
            null,
          origin:
            request.nextUrl.origin,
        });

  if (!result) {
    return NextResponse.json(
      {
        message:
          "Card production job not found.",
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
    {
      result,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}