import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { runGuardianPushOutbox } from "@/server/messaging/guardian-push-worker";
import {
  emitCasaOperationalNotificationBestEffort,
} from "@/server/internal/operational-notifications";

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
    await emitCasaOperationalNotificationBestEffort({
      event:
        "PLATFORM_CONFIGURATION_FAILURE",
      scope: {
        kind:
          "PLATFORM",
      },
      title:
        "Guardian push job is not configured",
      body:
        "CRON_SECRET is missing, so the guardian push delivery job cannot authenticate.",
      actionUrl:
        "/internal/health",
      dedupKey:
        "guardian-push-job:cron-secret-missing",
    });

    return NextResponse.json({ message: "CRON_SECRET is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!secureEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result =
      await runGuardianPushOutbox({
        limit: 50,
      });

    return NextResponse.json(
      {
        ok: true,
        ...result,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "PLATFORM_JOB_FAILURE",
      scope: {
        kind:
          "PLATFORM",
      },
      title:
        "Guardian push job failed",
      body:
        "The guardian push delivery worker stopped with an unexpected error.",
      actionUrl:
        "/internal/health",
      dedupKey:
        "guardian-push-job:unexpected-failure",
      payload: {
        errorName:
          error instanceof Error
            ? error.name
            : "UnknownError",
      },
    });

    throw error;
  }
}
