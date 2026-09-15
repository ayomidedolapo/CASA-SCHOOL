import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  runSmsOutbox,
} from "@/server/messaging/outbox-worker";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params:
    Promise<{
      slug:
        string;
    }>;
}

export async function POST(
  _request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
      );
    const result =
      await runSmsOutbox({
        schoolId:
          access.school.id,
        limit:
          25,
      });

    return NextResponse.json(
      {
        ok:
          true,
        ...result,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (
    error
  ) {
    if (
      error instanceof
      AuthRequiredError
    ) {
      return NextResponse.json(
        {
          message:
            "Sign in is required.",
        },
        {
          status:
            401,
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
            "Owner or Admin access is required.",
        },
        {
          status:
            403,
        },
      );
    }

    throw error;
  }
}
