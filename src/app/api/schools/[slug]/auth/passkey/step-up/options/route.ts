import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireSchoolAccess,
} from "@/server/auth/authorization";
import {
  beginPasskeyStepUp,
  isPasskeyStepUpAction,
} from "@/server/auth/passkey-step-up";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

const bodySchema =
  z.object({
    action:
      z.string().min(1),
  });

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

  try {
    const access =
      await requireSchoolAccess(
        slug,
      );

    const body =
      bodySchema.safeParse(
        await request.json(),
      );

    if (
      !body.success ||
      !isPasskeyStepUpAction(
        body.data.action,
      )
    ) {
      return NextResponse.json(
        {
          message:
            "Invalid Passkey authorization action.",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await beginPasskeyStepUp(
        access,
        body.data.action,
      );

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "A registered Passkey is required.",
          code:
            result.code,
        },
        {
          status:
            result.status,
        },
      );
    }

    return NextResponse.json(
      result,
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        "AuthRequiredError"
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
      error instanceof Error &&
      error.name ===
        "SchoolAccessDeniedError"
    ) {
      return NextResponse.json(
        {
          message:
            "School access denied.",
        },
        {
          status: 403,
        },
      );
    }

    throw error;
  }
}