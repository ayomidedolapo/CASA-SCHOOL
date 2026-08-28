import {
  NextRequest,
  NextResponse,
} from "next/server";
import type {
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";

import {
  requireSchoolAccess,
} from "@/server/auth/authorization";
import {
  finishPasskeyStepUp,
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
    ceremonyId:
      z.string().uuid(),
    action:
      z.string().min(1),
    response: z
      .object({
        id:
          z.string().min(1),
      })
      .passthrough(),
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
            "Invalid Passkey authorization response.",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await finishPasskeyStepUp({
        access,
        action:
          body.data.action,
        ceremonyId:
          body.data.ceremonyId,
        response:
          body.data.response as
            unknown as
            AuthenticationResponseJSON,
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Passkey authorization failed.",
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
      {
        grant:
          result.grant,
      },
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