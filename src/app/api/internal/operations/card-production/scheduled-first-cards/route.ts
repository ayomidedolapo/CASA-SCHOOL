import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  z,
} from "zod";

import {
  listScheduledFirstCardGroups,
} from "@/server/card-production/scheduled-card-policy";
import {
  requireCasaCapability,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

export const dynamic =
  "force-dynamic";

export async function GET(
  request:
    NextRequest,
) {
  try {
    await requireCasaCapability(
      "CARD_PRODUCTION_ADMIN",
    );

    const schoolId =
      request.nextUrl
        .searchParams
        .get(
          "schoolId",
        );
    const branchId =
      request.nextUrl
        .searchParams
        .get(
          "branchId",
        );

    for (
      const [
        label,
        value,
      ] of [
        [
          "school",
          schoolId,
        ],
        [
          "branch",
          branchId,
        ],
      ] as const
    ) {
      if (
        value &&
        !z.string()
          .uuid()
          .safeParse(
            value,
          )
          .success
      ) {
        return NextResponse.json(
          {
            message:
              `Invalid ${label} filter.`,
          },
          {
            status:
              400,
            headers:
              casaInternalNoStoreHeaders,
          },
        );
      }
    }

    const batches =
      await listScheduledFirstCardGroups({
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
    const response =
      casaInternalAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}
