import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  CardReplacementAttendanceError,
  getStudentCardAttendanceCompliance,
  recordCardReplacementAttendanceException,
} from "@/server/attendance/card-replacement";
import {
  attendanceNoStoreHeaders,
} from "@/server/attendance/http";
import {
  registryAuthErrorResponse,
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

const datePattern =
  /^\d{4}-\d{2}-\d{2}$/;

const recordSchema =
  z.object({
    verificationMethod:
      z.literal(
        "FACE_EXISTING_PROFILE",
      ),
  });

function domainErrorResponse(
  error: unknown,
) {
  if (
    error instanceof
      CardReplacementAttendanceError
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
          attendanceNoStoreHeaders,
      },
    );
  }

  return null;
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
            "Invalid card-replacement attendance exception request.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const parsed =
      recordSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid card-replacement attendance exception request.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      await recordCardReplacementAttendanceException({
        access,
        studentId,
        verificationMethod:
          parsed.data
            .verificationMethod,
      }),
      {
        status: 201,
        headers:
          attendanceNoStoreHeaders,
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

    const domain =
      domainErrorResponse(
        error,
      );

    if (domain) {
      return domain;
    }

    throw error;
  }
}

export async function GET(
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

    const fromDate =
      request.nextUrl
        .searchParams
        .get("fromDate");
    const toDate =
      request.nextUrl
        .searchParams
        .get("toDate");

    if (
      !fromDate ||
      !toDate ||
      !datePattern.test(
        fromDate,
      ) ||
      !datePattern.test(
        toDate,
      ) ||
      toDate < fromDate
    ) {
      return NextResponse.json(
        {
          message:
            "Valid fromDate and toDate are required.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        compliance:
          await getStudentCardAttendanceCompliance({
            access,
            studentId,
            fromDate,
            toDate,
          }),
      },
      {
        headers:
          attendanceNoStoreHeaders,
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

    const domain =
      domainErrorResponse(
        error,
      );

    if (domain) {
      return domain;
    }

    throw error;
  }
}
