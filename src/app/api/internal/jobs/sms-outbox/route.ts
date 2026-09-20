import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

export const dynamic =
  "force-dynamic";
export const maxDuration =
  60;

function secureEqual(
  left: string,
  right: string,
) {
  const a =
    Buffer.from(
      left,
    );
  const b =
    Buffer.from(
      right,
    );

  return (
    a.length ===
      b.length &&
    timingSafeEqual(
      a,
      b,
    )
  );
}

export async function GET(
  request:
    NextRequest,
) {
  const secret =
    process.env
      .CRON_SECRET
      ?.trim() ??
    "";

  if (!secret) {
    return NextResponse.json(
      {
        message:
          "CRON_SECRET is not configured.",
      },
      {
        status:
          503,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const expected =
    `Bearer ${secret}`;
  const actual =
    request.headers.get(
      "authorization",
    ) ??
    "";

  if (
    !secureEqual(
      actual,
      expected,
    )
  ) {
    return NextResponse.json(
      {
        message:
          "Unauthorized.",
      },
      {
        status:
          401,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      message: "SMS attendance delivery is retired. CASA guardian attendance notifications use Firebase Cloud Messaging.",
      code: "SMS_ATTENDANCE_DELIVERY_RETIRED",
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
