import {
  NextResponse,
} from "next/server";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolAccess,
} from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

  try {
    const access =
      await requireSchoolAccess(slug);

    return NextResponse.json(
      {
        authenticated: true,
        school: access.school,
        membership: access.membership,
        roles: access.roles,
      },
      {
        status: 200,
        headers: noStoreHeaders,
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
          headers: noStoreHeaders,
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
            "School access denied.",
        },
        {
          status: 403,
          headers: noStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        message:
          "Unable to resolve school access.",
      },
      {
        status: 500,
        headers: noStoreHeaders,
      },
    );
  }
}