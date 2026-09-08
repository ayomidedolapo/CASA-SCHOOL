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
  getCasaOnboardingStudent,
  updateCasaOnboardingStudent,
} from "@/server/internal/onboarding";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    schoolId: string;
    studentId: string;
  }>;
}

const datePattern =
  /^\d{4}-\d{2}-\d{2}$/;

const updateSchema =
  z.object({
    admissionNumber:
      z.string()
        .trim()
        .min(1)
        .max(64)
        .optional()
        .nullable(),
    firstName:
      z.string()
        .trim()
        .min(1)
        .max(100)
        .optional(),
    middleName:
      z.string()
        .trim()
        .max(100)
        .optional()
        .nullable(),
    lastName:
      z.string()
        .trim()
        .min(1)
        .max(100)
        .optional(),
    preferredName:
      z.string()
        .trim()
        .max(100)
        .optional()
        .nullable(),
    dateOfBirth:
      z.string()
        .regex(datePattern)
        .optional(),
    sex:
      z.enum([
        "MALE",
        "FEMALE",
        "UNSPECIFIED",
      ])
        .optional(),
    admissionDate:
      z.string()
        .regex(datePattern)
        .optional(),
  })
    .refine(
      (value) =>
        Object.values(
          value,
        ).some(
          (candidate) =>
            candidate !==
            undefined,
        ),
      {
        message:
          "At least one student field is required.",
      },
    );

export async function GET(
  _request: NextRequest,
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
    const student =
      await getCasaOnboardingStudent({
        access,
        studentId,
      });

    if (!student) {
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
      student,
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

export async function PATCH(
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
            "Invalid student update.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const parsed =
      updateSchema.safeParse(
        raw,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid student update.",
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

    const student =
      await updateCasaOnboardingStudent({
        access,
        studentId,
        ...parsed.data,
      });

    if (!student) {
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
        student,
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
