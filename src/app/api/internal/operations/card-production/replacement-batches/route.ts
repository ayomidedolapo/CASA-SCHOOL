import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  listReplacementBatchGroups,
  releaseDueReplacementBatch,
} from "@/server/card-production/replacement-batch";
import {
  requireCasaCapability,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";
import {
  writeCasaInternalAudit,
} from "@/server/internal/onboarding";

export const dynamic =
  "force-dynamic";

const releaseSchema =
  z.object({
    schoolId:
      z.string()
        .uuid(),
    batchEligibleOn:
      z.string()
        .regex(
          /^\d{4}-\d{2}-\d{2}$/,
        ),
    branchId:
      z.string()
        .uuid()
        .nullable()
        .optional(),
    limit:
      z.number()
        .int()
        .min(1)
        .max(500)
        .default(500),
  });

export async function GET(
  request:
    NextRequest,
) {
  try {
    await requireCasaCapability(
      "CARD_PRODUCTION_ADMIN",
    );

    const schoolId =
      request.nextUrl.searchParams.get(
        "schoolId",
      );

    if (
      schoolId &&
      !z.string()
        .uuid()
        .safeParse(
          schoolId,
        )
        .success
    ) {
      return NextResponse.json(
        {
          message:
            "Invalid school filter.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const branchId =
      request.nextUrl.searchParams.get(
        "branchId",
      );

    if (
      branchId &&
      !z.string()
        .uuid()
        .safeParse(
          branchId,
        )
        .success
    ) {
      return NextResponse.json(
        {
          message:
            "Invalid branch filter.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const batches =
      await listReplacementBatchGroups({
        schoolId:
          schoolId ??
          null,
        branchId:
          branchId ??
          null,
      });

    return NextResponse.json(
      {
        batches,
      },
      {
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      casaInternalAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    throw error;
  }
}

export async function POST(
  request:
    NextRequest,
) {
  try {
    const access =
      await requireCasaCapability(
        "CARD_PRODUCTION_ADMIN",
      );

    const body =
      releaseSchema.safeParse(
        await request
          .json()
          .catch(
            () => null,
          ),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid scheduled replacement batch release.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const result =
      await releaseDueReplacementBatch({
        schoolId:
          body.data.schoolId,
        batchEligibleOn:
          body.data.batchEligibleOn,
        branchId:
          body.data.branchId ??
          null,
        limit:
          body.data.limit,
        origin:
          request.nextUrl.origin,
      });

    await writeCasaInternalAudit({
      access,
      schoolId:
        body.data.schoolId,
      action:
        "CARD_REPLACEMENT_BATCH_RELEASED",
      subjectType:
        "SCHOOL",
      subjectId:
        body.data.schoolId,
      metadata: {
        batchEligibleOn:
          body.data.batchEligibleOn,
        branchId:
          body.data.branchId ??
          null,
        requested:
          result.requested,
        produced:
          result.produced,
        failed:
          result.failed,
      },
    });

    return NextResponse.json(
      result,
      {
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      casaInternalAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    throw error;
  }
}
