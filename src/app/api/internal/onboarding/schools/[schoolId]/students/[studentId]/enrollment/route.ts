import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireCasaInternalSchoolAccess,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";
import {
  assignCasaOnboardingEnrollment,
} from "@/server/internal/onboarding";

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
    academicSessionId:
      z.string().uuid(),
    classArmId:
      z.string().uuid(),
    startsOn:
      z.string()
        .regex(
          /^\d{4}-\d{2}-\d{2}$/,
        ),
  });

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    schoolId,
    studentId,
  } = await context.params;

  try {
    const access =
      await requireCasaInternalSchoolAccess(
        schoolId,
      );

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid enrollment request.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const parsed =
      bodySchema.safeParse(
        raw,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid enrollment details.",
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

    const enrollment =
      await assignCasaOnboardingEnrollment({
        access,
        studentId,
        ...parsed.data,
      });

    if (!enrollment) {
      return NextResponse.json(
        {
          message:
            "Student, academic session, or class assignment is invalid, or a conflicting future enrollment exists.",
        },
        {
          status: 409,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        enrollment,
      },
      {
        status: 201,
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
