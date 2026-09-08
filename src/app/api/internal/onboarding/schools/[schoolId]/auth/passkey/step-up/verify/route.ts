import {
  NextRequest,
  NextResponse,
} from "next/server";
import type {
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";

import {
  finishCasaInternalPasskeyStepUp,
} from "@/server/auth/passkey-step-up";
import {
  requireCasaInternalOnboardingCapability,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    schoolId: string;
  }>;
}

const bodySchema =
  z.object({
    ceremonyId:
      z.string().uuid(),
    action: z.enum([
      "BIOMETRIC_ENROLL",
      "BIOMETRIC_REENROLL",
    ]),
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
  const {
    schoolId,
  } =
    await context.params;

  try {
    const access =
      await requireCasaInternalOnboardingCapability(
        schoolId,
        "FACE_ENROLL",
      );

    const body =
      bodySchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid biometric Passkey authorization response.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const result =
      await finishCasaInternalPasskeyStepUp({
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
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        grant:
          result.grant,
      },
      {
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const authResponse =
      casaInternalAuthErrorResponse(
        error,
      );

    if (authResponse) {
      return authResponse;
    }

    throw error;
  }
}
