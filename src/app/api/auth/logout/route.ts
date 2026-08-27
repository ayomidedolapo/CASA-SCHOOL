import { NextResponse } from "next/server";

import { revokeCurrentAuthSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await revokeCurrentAuthSession();

  return NextResponse.json({
    signedOut: true,
  });
}