import {
  NextResponse,
} from "next/server";

import {
  requireAuthenticatedUser,
} from "@/server/auth/authorization";
import {
  beginPasskeyRegistration,
} from "@/server/auth/passkey-registration";

export const dynamic =
  "force-dynamic";

export async function POST() {
  try {
    const session =
      await requireAuthenticatedUser();

    const result =
      await beginPasskeyRegistration(
        session,
      );

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
      error.message ===
        "PASSKEY_RP_NOT_CONFIGURED"
    ) {
      return NextResponse.json(
        {
          message:
            "Passkey relying party is not configured.",
        },
        {
          status: 503,
        },
      );
    }

    throw error;
  }
}