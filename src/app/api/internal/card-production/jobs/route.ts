import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";
import {
  listCentralProductionJobs,
} from "@/server/card-production/production";

export const dynamic =
  "force-dynamic";

const statusSchema =
  z.enum([
    "READY",
    "EXPORTED",
    "PRINTED",
  ]);

export async function GET(
  request:
    NextRequest,
) {
  const auth =
    requireInternalCardProduction(
      request,
    );

  if (!auth.ok) {
    return auth.response;
  }

  const statusValue =
    request.nextUrl
      .searchParams
      .get(
        "status",
      );

  const status =
    statusValue
      ? statusSchema
          .safeParse(
            statusValue,
          )
      : null;

  if (
    status &&
    !status.success
  ) {
    return NextResponse.json(
      {
        message:
          "Invalid production status filter.",
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

  const schoolId =
    request.nextUrl
      .searchParams
      .get(
        "schoolId",
      );

  if (
    schoolId &&
    !z.string()
      .uuid()
      .safeParse(
        schoolId,
      ).success
  ) {
    return NextResponse.json(
      {
        message:
          "Invalid school filter.",
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

  const requestedLimit =
    Number(
      request.nextUrl
        .searchParams
        .get(
          "limit",
        ) ??
        "250",
    );

  const limit =
    Math.min(
      1000,
      Math.max(
        1,
        Number.isFinite(
          requestedLimit,
        )
          ? Math.floor(
              requestedLimit,
            )
          : 250,
      ),
    );

  const jobs =
    await listCentralProductionJobs({
      status:
        status?.success
          ? status.data
          : null,
      schoolId:
        schoolId ??
        null,
      limit,
      origin:
        request.nextUrl.origin,
    });

  return NextResponse.json(
    {
      jobs,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}