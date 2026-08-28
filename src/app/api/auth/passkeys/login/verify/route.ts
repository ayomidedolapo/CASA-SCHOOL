import {
  NextRequest,
  NextResponse,
} from "next/server";
import type {
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { z } from "zod";

import {
  finishPasskeyLogin,
} from "@/server/auth/passkey-login";

export const dynamic =
  "force-dynamic";

const bodySchema =
  z.object({
    ceremonyId:
      z.string().uuid(),
    response: z
      .object({
        id:
          z.string().min(1),
        response: z
          .object({
            userHandle:
              z.string()
                .optional()
                .nullable(),
          })
          .passthrough(),
      })
      .passthrough(),
  });

export async function POST(
  request: NextRequest,
) {
  let raw: unknown;

  try {
    raw =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        message:
          "Invalid Passkey login response.",
      },
      {
        status: 400,
      },
    );
  }

  const body =
    bodySchema.safeParse(raw);

  if (!body.success) {
    return NextResponse.json(
      {
        message:
          "Invalid Passkey login response.",
      },
      {
        status: 400,
      },
    );
  }

  const result =
    await finishPasskeyLogin({
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
          "Passkey login failed.",
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
      authenticated:
        true,
      expiresAt:
        result.expiresAt,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}