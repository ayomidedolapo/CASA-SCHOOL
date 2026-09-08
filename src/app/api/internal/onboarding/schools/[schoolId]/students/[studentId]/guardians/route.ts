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
  addCasaOnboardingGuardian,
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
    fullName:
      z.string()
        .trim()
        .min(2)
        .max(200),
    email:
      z.string()
        .trim()
        .email()
        .max(320)
        .optional()
        .nullable(),
    phone:
      z.string()
        .trim()
        .min(5)
        .max(32)
        .optional()
        .nullable(),
    relationshipLabel:
      z.string()
        .trim()
        .min(2)
        .max(80),
    isPrimary:
      z.boolean()
        .default(false),
    isEmergencyContact:
      z.boolean()
        .default(false),
    pickupAuthorized:
      z.boolean()
        .default(false),
    receivesNotifications:
      z.boolean()
        .default(true),
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
            "Invalid guardian request.",
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
            "Invalid guardian details.",
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

    const guardian =
      await addCasaOnboardingGuardian({
        access,
        studentId,
        ...parsed.data,
      });

    if (!guardian) {
      return NextResponse.json(
        {
          message:
            "Student not found.",
        },
        {
          status: 404,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        guardian,
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
