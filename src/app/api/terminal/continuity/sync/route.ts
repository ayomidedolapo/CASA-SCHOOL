import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  syncContinuityEvent,
} from "@/server/attendance/continuity-sync";
import {
  attendanceNoStoreHeaders,
  terminalUnauthorizedResponse,
} from "@/server/attendance/http";
import {
  authenticateTerminalRequest,
} from "@/server/attendance/terminal-auth";
import {
  runGuardianPushOutboxForPresenceEvent,
} from "@/server/messaging/guardian-push-worker";

export const dynamic =
  "force-dynamic";

const eventSchema =
  z.object({
    requestId: z
      .string()
      .regex(
        /^[A-Za-z0-9_-]{8,64}$/,
      ),
    sessionId: z
      .string()
      .uuid(),
    studentId: z
      .string()
      .uuid(),
    tokenHash: z
      .string()
      .regex(
        /^[0-9a-f]{64}$/,
      ),
    operation:
      z.enum([
        "CHECK_IN",
        "CHECK_OUT",
      ]),
    timeResult:
      z.enum([
        "NOT_RUN",
        "ON_TIME",
        "LATE",
      ]),
    departureResult:
      z.enum([
        "NOT_RUN",
        "NORMAL",
      ]),
    capturedAt: z
      .string()
      .datetime({
        offset: true,
      }),
    connectivityMode:
      z.enum([
        "DEGRADED",
        "OFFLINE",
      ]),
    cacheIssuedAt: z
      .string()
      .datetime({
        offset: true,
      }),
    cacheExpiresAt: z
      .string()
      .datetime({
        offset: true,
      }),
  });

const syncSchema =
  z.object({
    events:
      z.array(
        eventSchema,
      )
        .min(1)
        .max(100),
  });

export async function POST(
  request: NextRequest,
) {
  const access =
    await authenticateTerminalRequest(
      request,
    );

  if (!access) {
    return terminalUnauthorizedResponse();
  }

  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        message:
          "Invalid continuity sync request.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const parsed =
    syncSchema.safeParse(
      body,
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          "Invalid continuity sync request.",
      },
      {
        status: 400,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  const results = [];

  for (
    const event of
      parsed.data.events
  ) {
    results.push(
      await syncContinuityEvent(
        access,
        event,
      ),
    );
  }

  const guardianPushDelivery = [];

  for (
    const result of
      results
  ) {
    if (
      result.status !==
        "RECORDED"
    ) {
      continue;
    }

    try {
      guardianPushDelivery.push({
        requestId:
          result.requestId,
        presenceEventId:
          result.presenceEventId,
        delivery:
          await runGuardianPushOutboxForPresenceEvent({
            schoolId:
              access.school.id,
            presenceEventId:
              result.presenceEventId,
            limit: 50,
          }),
      });
    } catch {
      // Durable outbox remains available for the scheduled worker.
    }
  }

  return NextResponse.json(
    {
      results,
      guardianPushDelivery,
      serverTime:
        new Date()
          .toISOString(),
    },
    {
      headers:
        attendanceNoStoreHeaders,
    },
  );
}
