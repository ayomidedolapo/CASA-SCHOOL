import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  getPendingCardReplacementCase,
  reportStudentCardLost,
  requestStudentCardReplacement,
} from "@/server/attendance/card-replacement";
import {
  registryAuthErrorResponse,
  registryNoStoreHeaders,
  requireRegistryOperator,
} from "@/server/registry/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
  }>;
}

const mutationSchema =
  z.discriminatedUnion(
    "action",
    [
      z.object({
        action:
          z.literal(
            "REPORT_LOST",
          ),
        reason:
          z.string()
            .trim()
            .min(1)
            .max(240)
            .optional()
            .nullable(),
      }),
      z.object({
        action:
          z.literal(
            "REQUEST_REPLACEMENT",
          ),
      }),
    ],
  );

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
  } = await context.params;

  try {
    const access =
      await requireRegistryOperator(
        slug,
      );

    return NextResponse.json(
      {
        replacementCase:
          await getPendingCardReplacementCase({
            schoolId:
              access.school.id,
            studentId,
          }),
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      registryAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    throw error;
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
  } = await context.params;

  try {
    const access =
      await requireRegistryOperator(
        slug,
      );

    let body: unknown;

    try {
      body =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid card replacement request.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const parsed =
      mutationSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid card replacement request.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const result =
      parsed.data.action ===
        "REPORT_LOST"
        ? await reportStudentCardLost({
            access,
            studentId,
            reason:
              parsed.data.reason ??
              null,
          })
        : {
            case:
              await requestStudentCardReplacement({
                access,
                studentId,
              }),
            created:
              false,
          };

    return NextResponse.json(
      result,
      {
        status:
          parsed.data.action ===
            "REPORT_LOST" &&
          result.created
            ? 201
            : 200,
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      registryAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    if (
      error &&
      typeof error === "object" &&
      "status" in error &&
      "code" in error &&
      typeof (
        error as {
          status?: unknown;
        }
      ).status === "number" &&
      typeof (
        error as {
          code?: unknown;
        }
      ).code === "string"
    ) {
      const domain =
        error as {
          message:
            string;
          status:
            number;
          code:
            string;
        };

      return NextResponse.json(
        {
          message:
            domain.message,
          code:
            domain.code,
        },
        {
          status:
            domain.status,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}
