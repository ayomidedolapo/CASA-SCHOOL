import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";
import {
  listRenewalBatches,
} from "@/server/card-production/renewal-manifest";

export const dynamic =
  "force-dynamic";

const querySchema =
  z.object({
    schoolId:
      z.string()
        .uuid()
        .nullable(),
    status:
      z.enum([
        "PLANNED",
        "READY",
        "EXPORTED",
        "PRINTED",
        "CANCELLED",
      ])
        .nullable(),
  });

export async function GET(
  request: NextRequest,
) {
  const auth =
    requireInternalCardProduction(
      request,
    );

  if (!auth.ok) {
    return auth.response;
  }

  const parsed =
    querySchema.safeParse({
      schoolId:
        request.nextUrl.searchParams.get(
          "schoolId",
        ),
      status:
        request.nextUrl.searchParams.get(
          "status",
        ),
    });

  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          "Invalid renewal batch filter.",
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

  const batches =
    await listRenewalBatches({
      schoolId:
        parsed.data.schoolId,
      status:
        parsed.data.status,
    });

  return NextResponse.json(
    {
      batches,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
