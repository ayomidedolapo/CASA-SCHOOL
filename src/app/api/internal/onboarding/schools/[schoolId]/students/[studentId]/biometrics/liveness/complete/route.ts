import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  AwsBiometricUnavailableError,
  completeAwsEnrollmentLiveness,
} from "@/server/biometrics/aws-liveness";
import {
  requireCasaInternalOnboardingCapability,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    schoolId: string;
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
    schoolId,
    studentId,
  } =
    await context.params;

  try {
    const access =
      await requireCasaInternalOnboardingCapability(
        schoolId,
        "FACE_ENROLL",
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
          headers:
            casaInternalNoStoreHeaders,
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
        actorScope:
          "CASA_INTERNAL",
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Face enrollment liveness could not be completed.",
          code:
            result.code,
        },
        {
          status:
            result.status,
          headers:
            casaInternalNoStoreHeaders,
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
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const authResponse =
      casaInternalAuthErrorResponse(
        error,
      );

    if (authResponse) {
      return authResponse;
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
          headers:
            casaInternalNoStoreHeaders,
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
          headers:
            casaInternalNoStoreHeaders,
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
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}
