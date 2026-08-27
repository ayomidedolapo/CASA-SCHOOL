import { NextResponse } from "next/server";

import { getCurrentAuthSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session =
    await getCurrentAuthSession();

  if (!session) {
    return NextResponse.json({
      authenticated: false,
    });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.userId,
      fullName: session.fullName,
      email: session.email,
      phone: session.phone,
    },
    expiresAt:
      session.expiresAt.toISOString(),
  });
}