import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  buildCardProductionManifest,
} from "@/server/card-production/manifest";
import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";
import {
  listCentralProductionJobs,
  markJobsExported,
} from "@/server/card-production/production";

export const dynamic =
  "force-dynamic";

const bodySchema =
  z.object({
    status:
      z.enum([
        "READY",
        "EXPORTED",
        "PRINTED",
      ])
        .nullable()
        .optional(),
    schoolId:
      z.string()
        .uuid()
        .nullable()
        .optional(),
    limit:
      z.number()
        .int()
        .min(1)
        .max(5000)
        .default(1000),
  });

export async function POST(
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
          "Invalid production manifest request.",
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

  const jobs =
    await listCentralProductionJobs({
      status:
        body.data.status ??
        null,
      schoolId:
        body.data.schoolId ??
        null,
      limit:
        body.data.limit,
      origin:
        request.nextUrl.origin,
    });

  const exportDate =
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

  const workbook =
    await buildCardProductionManifest({
      jobs,
      exportDate,
    });

  await markJobsExported(
    jobs.map(
      (job) =>
        job.id,
    ),
  );

  return new NextResponse(
    new Uint8Array(
      workbook,
    ),
    {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          `attachment; filename="casa-card-production-${exportDate}.xlsx"`,
        "Cache-Control":
          "no-store",
      },
    },
  );
}