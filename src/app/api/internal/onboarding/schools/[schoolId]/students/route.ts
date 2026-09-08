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
  createCasaOnboardingStudent,
  searchCasaOnboardingStudents,
} from "@/server/internal/onboarding";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    schoolId: string;
  }>;
}

const datePattern =
  /^\d{4}-\d{2}-\d{2}$/;

const createSchema =
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
        .max(100),
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
        .max(100),
    preferredName:
      z.string()
        .trim()
        .max(100)
        .optional()
        .nullable(),
    dateOfBirth:
      z.string()
        .regex(datePattern),
    sex:
      z.enum([
        "MALE",
        "FEMALE",
        "UNSPECIFIED",
      ]),
    admissionDate:
      z.string()
        .regex(datePattern),
  });

export async function GET(
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
    const search =
      request.nextUrl.searchParams;
    const page =
      Math.max(
        1,
        Number.parseInt(
          search.get("page") ??
            "1",
          10,
        ) || 1,
      );
    const section =
      z.enum([
        "ALL",
        "PRIMARY",
        "SECONDARY",
      ]).catch("ALL").parse(
        search.get("section") ??
          "ALL",
      );
    const face =
      z.enum([
        "ALL",
        "NEEDED",
        "COMPLETE",
        "REVIEW",
      ]).catch("ALL").parse(
        search.get("face") ??
          "ALL",
      );
    const completion =
      z.enum([
        "ALL",
        "INCOMPLETE",
        "COMPLETE",
      ]).catch("ALL").parse(
        search.get("completion") ??
          "ALL",
      );

    const result =
      await searchCasaOnboardingStudents({
        access,
        query:
          search.get("q") ??
          "",
        page,
        pageSize: 25,
        section,
        face,
        completion,
      });

    return NextResponse.json(
      result,
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

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid student request.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const parsed =
      createSchema.safeParse(
        raw,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid student details.",
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
      await createCasaOnboardingStudent({
        access,
        ...parsed.data,
      });

    return NextResponse.json(
      {
        student,
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
