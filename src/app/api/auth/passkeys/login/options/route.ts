import {
  NextResponse,
} from "next/server";

import {
  beginPasskeyLogin,
} from "@/server/auth/passkey-login";

export const dynamic =
  "force-dynamic";

export async function POST() {
  try {
    const result =
      await beginPasskeyLogin();

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