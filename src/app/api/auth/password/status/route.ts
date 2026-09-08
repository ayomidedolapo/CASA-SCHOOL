import {
  NextResponse,
} from "next/server";
import {
  eq,
} from "drizzle-orm";

import {
  getDb,
} from "@/db";
import {
  authPasswordCredentials,
} from "@/db/schema";
import {
  requireAuthenticatedUser,
} from "@/server/auth/authorization";

export const dynamic =
  "force-dynamic";

const noStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function GET() {
  try {
    const session =
      await requireAuthenticatedUser();

    const db =
      getDb();

    const rows =
      await db
        .select({
          mustChangePassword:
            authPasswordCredentials
              .mustChangePassword,
        })
        .from(
          authPasswordCredentials,
        )
        .where(
          eq(
            authPasswordCredentials
              .userId,
            session.userId,
          ),
        )
        .limit(
          1,
        );

    return NextResponse.json(
      {
        hasPassword:
          Boolean(
            rows[0],
          ),
        mustChangePassword:
          rows[0]
            ?.mustChangePassword ??
          false,
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (error) {
    if (
      error instanceof
        Error &&
      error.name ===
        "AuthRequiredError"
    ) {
      return NextResponse.json(
        {
          message:
            "Authentication required.",
        },
        {
          status:
            401,
          headers:
            noStoreHeaders,
        },
      );
    }

    throw error;
  }
}
