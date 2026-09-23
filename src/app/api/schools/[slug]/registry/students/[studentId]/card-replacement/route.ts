import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  getPendingCardReplacementCase,
  markStudentCardReplacementPaid,
  reportStudentCardLost,
  requestStudentCardReplacement,
} from "@/server/attendance/card-replacement";
import {
  consumePasskeyStepUpGrant,
} from "@/server/auth/passkey-step-up";
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
            "REPORT_DAMAGED",
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
      z.object({
        action:
          z.literal(
            "MARK_PAID",
          ),
        paymentReference:
          z.string()
            .trim()
            .min(1)
            .max(120)
            .optional()
            .nullable(),
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

    let result;

    if (
      parsed.data.action ===
        "REPORT_LOST" ||
      parsed.data.action ===
        "REPORT_DAMAGED"
    ) {
      result =
        await reportStudentCardLost({
          access,
          studentId,
          reason:
            parsed.data.reason ??
            null,
          replacementReason:
            parsed.data.action ===
              "REPORT_DAMAGED"
              ? "DAMAGED"
              : "LOST",
        });
    } else if (
      parsed.data.action ===
      "MARK_PAID"
    ) {
      const token =
        request.headers.get(
          "x-casa-passkey-step-up",
        );

      const authorized =
        token
          ? await consumePasskeyStepUpGrant({
              token,
              access,
              action:
                "CARD_REPLACEMENT_PAYMENT",
            })
          : false;

      if (!authorized) {
        return NextResponse.json(
          {
            message:
              "Passkey authorization is required to mark a replacement payment as received.",
            code:
              "PASSKEY_STEP_UP_REQUIRED",
            requiredAction:
              "CARD_REPLACEMENT_PAYMENT",
          },
          {
            status: 403,
            headers:
              registryNoStoreHeaders,
          },
        );
      }

      result = {
        case:
          await markStudentCardReplacementPaid({
            access,
            studentId,
            paymentReference:
              parsed.data
                .paymentReference ??
              null,
          }),
        created:
          false,
      };
    } else {
      result = {
        case:
          await requestStudentCardReplacement({
            access,
            studentId,
          }),
        created:
          false,
      };
    }

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
