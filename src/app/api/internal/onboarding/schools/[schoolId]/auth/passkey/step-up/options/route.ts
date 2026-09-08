import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  beginCasaInternalPasskeyStepUp,
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
    action: z.enum([
      "BIOMETRIC_ENROLL",
      "BIOMETRIC_REENROLL",
    ]),
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
            "Invalid biometric Passkey authorization action.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const result =
      await beginCasaInternalPasskeyStepUp(
        access,
        body.data.action,
      );

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "A registered Passkey is required for face enrollment.",
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
      result,
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
