import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  eq,
} from "drizzle-orm";
import {
  z,
} from "zod";

import {
  getDb,
} from "@/db";
import {
  authPasswordCredentials,
} from "@/db/schema";
import {
  requireAuthenticatedUser,
} from "@/server/auth/authorization";
import {
  assertPasswordPolicy,
  hashPassword,
  verifyPassword,
} from "@/server/auth/password";

export const dynamic =
  "force-dynamic";

const noStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

const bodySchema =
  z.object({
    currentPassword:
      z.string()
        .min(1)
        .max(128),
    newPassword:
      z.string()
        .min(12)
        .max(128),
  });

export async function POST(
  request:
    NextRequest,
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
            "Enter your current password and a new password of at least 12 characters.",
        },
        {
          status:
            400,
          headers:
            noStoreHeaders,
        },
      );
    }

    const db =
      getDb();

    const rows =
      await db
        .select({
          passwordHash:
            authPasswordCredentials
              .passwordHash,
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

    const credential =
      rows[0];

    if (!credential) {
      return NextResponse.json(
        {
          message:
            "This account does not currently have a password credential.",
        },
        {
          status:
            409,
          headers:
            noStoreHeaders,
        },
      );
    }

    const currentValid =
      await verifyPassword(
        credential.passwordHash,
        body.data
          .currentPassword,
      );

    if (!currentValid) {
      return NextResponse.json(
        {
          message:
            "Current password is incorrect.",
        },
        {
          status:
            401,
          headers:
            noStoreHeaders,
        },
      );
    }

    if (
      body.data
        .currentPassword ===
      body.data
        .newPassword
    ) {
      return NextResponse.json(
        {
          message:
            "Choose a new password different from the current password.",
        },
        {
          status:
            400,
          headers:
            noStoreHeaders,
        },
      );
    }

    try {
      assertPasswordPolicy(
        body.data
          .newPassword,
      );
    } catch (error) {
      return NextResponse.json(
        {
          message:
            error instanceof
              Error
              ? error.message
              : "The new password does not meet CASA security requirements.",
        },
        {
          status:
            400,
          headers:
            noStoreHeaders,
        },
      );
    }

    const passwordHash =
      await hashPassword(
        body.data
          .newPassword,
      );

    await db
      .update(
        authPasswordCredentials,
      )
      .set({
        passwordHash,
        mustChangePassword:
          false,
        passwordChangedAt:
          new Date(),
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          authPasswordCredentials
            .userId,
          session.userId,
        ),
      );

    return NextResponse.json(
      {
        changed:
          true,
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
