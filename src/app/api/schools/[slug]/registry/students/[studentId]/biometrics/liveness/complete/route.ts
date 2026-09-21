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
  AwsBiometricUnavailableError,
  completeAwsEnrollmentLiveness,
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
  request: NextRequest,
  context: RouteContext,
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

    const body =
      bodySchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid liveness completion request.",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await completeAwsEnrollmentLiveness({
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
            result.code ===
              "FACE_ALREADY_ENROLLED_TO_ANOTHER_STUDENT"
              ? "This face is already enrolled to another student in this school. Confirm the student's identity before trying again."
              : "Face enrollment liveness could not be completed.",
          code:
            result.code,
        },
        {
          status:
            result.status,
          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    return NextResponse.json(
      {
        profile:
          result.profile,
      },
      {
        status: 201,
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
        },
      );
    }

    if (
      error instanceof
      AwsBiometricUnavailableError
    ) {
      return NextResponse.json(
        {
          message:
            "AWS biometric service is temporarily unavailable.",
          code:
            "AWS_BIOMETRIC_UNAVAILABLE",
        },
        {
          status: 503,
        },
      );
    }

    if (
      error instanceof Error &&
      (
        error.message ===
          "AWS_FACE_NOT_INDEXED" ||
        error.message ===
          "AWS_MULTIPLE_FACES_DETECTED"
      )
    ) {
      return NextResponse.json(
        {
          message:
            "The enrollment face could not be accepted.",
          code:
            error.message,
        },
        {
          status: 422,
        },
      );
    }

    if (
      error instanceof Error &&
      (
        error.message ===
          "BIOMETRIC_POLICY_NOT_CONFIGURED" ||
        error.message ===
          "BIOMETRIC_POLICY_INVALID" ||
        error.message ===
          "BIOMETRIC_PROVIDER_MODE_NOT_CONFIGURED" ||
        error.message ===
          "BIOMETRIC_PROVIDER_MODE_MISMATCH" ||
        error.message ===
          "AWS_BIOMETRIC_NOT_CONFIGURED" ||
        error.message ===
          "AWS_BIOMETRIC_INVALID_QUALITY_FILTER"
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
        },
      );
    }

    throw error;
  }
}