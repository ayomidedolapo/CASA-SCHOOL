import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  loginWithPassword,
} from "@/server/auth/login";
import {
  getTrustedSourceAddress,
} from "@/server/auth/security";
import {
  emitCasaOperationalNotificationBestEffort,
} from "@/server/internal/operational-notifications";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  identifier: z
    .string()
    .min(1)
    .max(320),
  password: z
    .string()
    .min(1)
    .max(128),
});

const noStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function POST(
  request: NextRequest,
) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        message:
          "Invalid sign-in request.",
      },
      {
        status: 400,
        headers: noStoreHeaders,
      },
    );
  }

  const parsed =
    loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          "Invalid sign-in request.",
      },
      {
        status: 400,
        headers: noStoreHeaders,
      },
    );
  }

  const result =
    await loginWithPassword({
      identifier:
        parsed.data.identifier,
      password:
        parsed.data.password,
      sourceAddress:
        getTrustedSourceAddress(
          request,
        ),
    });

  if (!result.ok) {
    const headers =
      new Headers(
        noStoreHeaders,
      );

    if (
      result.status === 429 &&
      result.retryAfterSeconds
    ) {
      headers.set(
        "Retry-After",
        String(
          result.retryAfterSeconds,
        ),
      );
    }

    if (
      result.status ===
      429
    ) {
      await emitCasaOperationalNotificationBestEffort({
        event:
          "AUTH_RATE_LIMIT_TRIGGERED",
        scope: {
          kind:
            "PLATFORM",
        },
        title:
          "Sign-in rate limit triggered",
        body:
          "CASA blocked repeated sign-in attempts. Review security activity if this occurs unexpectedly or repeatedly.",
        actionUrl:
          "/internal/security",
        dedupKey:
          "auth-rate-limit:platform",
      });
    }

    return NextResponse.json(
      {
        message:
          result.status === 429
            ? "Too many sign-in attempts. Please try again later."
            : result.status === 400
              ? "Invalid sign-in request."
              : "Invalid email/phone or password.",
      },
      {
        status: result.status,
        headers,
      },
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: result.user,
      expiresAt:
        result.expiresAt.toISOString(),
    },
    {
      status: 200,
      headers: noStoreHeaders,
    },
  );
}