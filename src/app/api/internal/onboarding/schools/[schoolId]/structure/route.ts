import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireCasaCapability,
  requireCasaInternalSchoolAccess,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";
import {
  SchoolOperationsError,
} from "@/server/school-operations/errors";
import {
  restructureStandaloneSchool,
} from "@/server/school-operations/structure-correction";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    schoolId: string;
  }>;
}

const uuid =
  z.string().uuid();

const branchSchema =
  z.object({
    name:
      z.string()
        .trim()
        .min(2)
        .max(160),
    code:
      z.string()
        .trim()
        .min(1)
        .max(40),
    address:
      z.string()
        .trim()
        .max(300)
        .optional()
        .nullable(),
    classArmIds:
      z.array(uuid)
        .max(100)
        .default([]),
  });

const schema =
  z.object({
    headquarters:
      z.object({
        name:
          z.string()
            .trim()
            .min(2)
            .max(160),
        code:
          z.string()
            .trim()
            .min(1)
            .max(40),
        address:
          z.string()
            .trim()
            .max(300)
            .optional()
            .nullable(),
      }),
    branches:
      z.array(
        branchSchema,
      )
        .min(1)
        .max(12),
    reason:
      z.string()
        .trim()
        .min(3)
        .max(240),
  });

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    schoolId,
  } = await context.params;

  try {
    const access =
      await requireCasaInternalSchoolAccess(
        schoolId,
      );

    await requireCasaCapability(
      "ORGANIZATION_RESTRUCTURE",
    );

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid restructure request.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const parsed =
      schema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid restructure request.",
          issues:
            parsed.error.issues,
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const result =
      await restructureStandaloneSchool({
        access,
        headquarters: {
          ...parsed.data.headquarters,
          address:
            parsed.data
              .headquarters
              .address ??
            null,
        },
        branches:
          parsed.data.branches.map(
            (branch) => ({
              ...branch,
              address:
                branch.address ??
                null,
            }),
          ),
        reason:
          parsed.data.reason,
      });

    return NextResponse.json(
      {
        restructure:
          result,
      },
      {
        status: 201,
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

    if (
      error instanceof
      SchoolOperationsError
    ) {
      return NextResponse.json(
        {
          message:
            error.message,
          code:
            error.code,
        },
        {
          status:
            error.status,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}
