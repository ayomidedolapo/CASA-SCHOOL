import {
  and,
  desc,
  eq,
  isNull,
} from "drizzle-orm";
import {
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  authPasskeys,
} from "@/db/schema";
import {
  requireAuthenticatedUser,
} from "@/server/auth/authorization";

export const dynamic =
  "force-dynamic";

export async function GET() {
  try {
    const session =
      await requireAuthenticatedUser();

    const db = getDb();

    const passkeys =
      await db
        .select({
          id:
            authPasskeys.id,
          label:
            authPasskeys.label,
          deviceType:
            authPasskeys.deviceType,
          backedUp:
            authPasskeys.backedUp,
          transports:
            authPasskeys.transports,
          createdAt:
            authPasskeys.createdAt,
          lastUsedAt:
            authPasskeys.lastUsedAt,
        })
        .from(authPasskeys)
        .where(
          and(
            eq(
              authPasskeys.userId,
              session.userId,
            ),
            isNull(
              authPasskeys.revokedAt,
            ),
          ),
        )
        .orderBy(
          desc(
            authPasskeys.createdAt,
          ),
        );

    return NextResponse.json(
      {
        passkeys,
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

    throw error;
  }
}