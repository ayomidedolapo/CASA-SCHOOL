import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  cancelAwsEnrollmentLiveness,
} from "@/server/biometrics/aws-liveness";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
  }>;
}

const bodySchema =
  z.object({
    livenessSessionId:
      z.string().uuid(),
  });

export async function POST(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
    studentId,
  } =
    await context.params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
          "SCHOOL_TECHNICIAN",
        ],
      );

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid liveness cancellation request.",
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
            "Invalid liveness cancellation request.",
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
      await cancelAwsEnrollmentLiveness({
        access,
        studentId,
        livenessSessionId:
          body.data
            .livenessSessionId,
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "The enrollment liveness session is no longer cancellable.",
          code:
            "LIVENESS_SESSION_NOT_CANCELLABLE",
        },
        {
          status: 409,
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    return NextResponse.json(
      {
        cancelled: true,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      AuthRequiredError
    ) {
      return NextResponse.json(
        {
          message:
            "Authentication required.",
        },
        {
          status: 401,
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    if (
      error instanceof
      SchoolAccessDeniedError
    ) {
      return NextResponse.json(
        {
          message:
            "Biometric enrollment access denied.",
        },
        {
          status: 403,
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    if (
      error instanceof Error &&
      (
        error.message ===
          "BIOMETRIC_PROVIDER_MODE_NOT_CONFIGURED" ||
        error.message ===
          "BIOMETRIC_PROVIDER_MODE_MISMATCH"
      )
    ) {
      return NextResponse.json(
        {
          message:
            "AWS biometric engine is not configured.",
          code:
            error.message,
        },
        {
          status: 503,
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    throw error;
  }
}