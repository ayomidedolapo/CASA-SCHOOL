import { NextResponse } from "next/server";

import {
  getCurrentAuthSession,
  SESSION_IDLE_TIMEOUT_SECONDS,
  touchCurrentAuthSession,
} from "@/server/auth/session";

export const dynamic = "force-dynamic";

function payload(
  session:
    Awaited<
      ReturnType<
        typeof getCurrentAuthSession
      >
    >,
) {
  if (!session) {
    return {
      authenticated:
        false,
      idleTimeoutSeconds:
        SESSION_IDLE_TIMEOUT_SECONDS,
    };
  }

  return {
    authenticated:
      true,
    user: {
      id:
        session.userId,
      fullName:
        session.fullName,
      email:
        session.email,
      phone:
        session.phone,
    },
    expiresAt:
      session.expiresAt.toISOString(),
    lastSeenAt:
      session.lastSeenAt.toISOString(),
    idleTimeoutSeconds:
      SESSION_IDLE_TIMEOUT_SECONDS,
  };
}

export async function GET() {
  const session =
    await getCurrentAuthSession();

  return NextResponse.json(
    payload(session),
    {
      status:
        session
          ? 200
          : 401,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

export async function POST() {
  const session =
    await touchCurrentAuthSession();

  return NextResponse.json(
    payload(session),
    {
      status:
        session
          ? 200
          : 401,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
