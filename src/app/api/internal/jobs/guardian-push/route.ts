import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { runGuardianPushOutbox } from "@/server/messaging/guardian-push-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (!secret) {
    return NextResponse.json({ message: "CRON_SECRET is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!secureEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const result = await runGuardianPushOutbox({ limit: 50 });
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
