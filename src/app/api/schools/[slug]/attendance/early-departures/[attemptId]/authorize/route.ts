import {
  randomUUID,
} from "node:crypto";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  authorizeEarlyDeparture,
  cancelEarlyDeparture,
} from "@/server/attendance/early-departure";
import {
  attendanceAuthErrorResponse,
  attendanceNoStoreHeaders,
} from "@/server/attendance/http";
import {
  requireSchoolAccess,
} from "@/server/auth/authorization";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    attemptId: string;
  }>;
}

const bodySchema =
  z.object({
    reason:
      z.string()
        .trim()
        .min(3)
        .max(240),
  });

export async function POST(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
    attemptId,
  } =
    await context.params;

  if (
    !z.string()
      .uuid()
      .safeParse(
        attemptId,
      ).success
  ) {
    return NextResponse.json(
      {
        message:
          "Invalid attendance attempt.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  try {
    const access =
      await requireSchoolAccess(
        slug,
      );

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid early departure request.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
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
            "A clear early-departure reason is required.",
        },
        {
          status: 400,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    const result =
      await authorizeEarlyDeparture({
        access,
        attemptId,
        reason:
          body.data.reason,
        stepUpToken:
          request.headers.get(
            "x-casa-passkey-step-up",
          ),
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Early departure could not be authorized.",
          code:
            result.code,
          requiredAction:
            "requiredAction" in
              result
              ? result.requiredAction
              : undefined,
        },
        {
          status:
            result.status,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      result,
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      attendanceAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}

export async function DELETE(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
    attemptId,
  } =
    await context.params;

  if (
    !z.string()
      .uuid()
      .safeParse(
        attemptId,
      ).success
  ) {
    return NextResponse.json(
      {
        message:
          "Invalid attendance attempt.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  try {
    const access =
      await requireSchoolAccess(
        slug,
      );

    const result =
      await cancelEarlyDeparture({
        access,
        attemptId,
        stepUpToken:
          request.headers.get(
            "x-casa-passkey-step-up",
          ),
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Early departure request could not be cancelled.",
          code:
            result.code,
          requiredAction:
            "requiredAction" in
              result
              ? result.requiredAction
              : undefined,
        },
        {
          status:
            result.status,
          headers:
            attendanceNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      result,
      {
        headers:
          attendanceNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      attendanceAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    const incidentId =
      randomUUID();

    console.error(
      "CASA_EARLY_DEPARTURE_CANCEL_FAILED",
      {
        incidentId,
        schoolSlug:
          slug,
        attemptId,
        error:
          error instanceof Error
            ? {
                name:
                  error.name,
                message:
                  error.message,
                stack:
                  error.stack,
              }
            : String(error),
      },
    );

    return NextResponse.json(
      {
        message:
          "CASA could not cancel this early-departure request.",
        code:
          "EARLY_DEPARTURE_CANCEL_FAILED",
        incidentId,
      },
      {
        status: 500,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }
}