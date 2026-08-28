import {
  NextRequest,
  NextResponse,
} from "next/server";
import type {
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";

import {
  requireAuthenticatedUser,
} from "@/server/auth/authorization";
import {
  finishPasskeyRegistration,
} from "@/server/auth/passkey-registration";

export const dynamic =
  "force-dynamic";

const bodySchema =
  z.object({
    ceremonyId:
      z.string().uuid(),
    label: z
      .string()
      .trim()
      .max(120)
      .optional()
      .nullable(),
    response: z
      .object({
        id:
          z.string().min(1),
      })
      .passthrough(),
  });

export async function POST(
  request: NextRequest,
) {
  try {
    const session =
      await requireAuthenticatedUser();

    const body =
      bodySchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid Passkey registration response.",
        },
        {
          status: 400,
        },
      );
    }

    const result =
      await finishPasskeyRegistration({
        session,
        ceremonyId:
          body.data.ceremonyId,
        label:
          body.data.label,
        response:
          body.data
            .response as
            unknown as
            RegistrationResponseJSON,
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Passkey registration could not be completed.",
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
        passkey:
          result.passkey,
      },
      {
        status: 201,
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

    throw error;
  }
}