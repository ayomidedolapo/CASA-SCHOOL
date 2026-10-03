import {
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  z,
} from "zod";

import {
  getDb,
} from "@/db";

export const dynamic =
  "force-dynamic";

const bodySchema =
  z.object({
    outboxId:
      z.string().uuid(),
    receiptToken:
      z.string().uuid(),
    source:
      z.enum([
        "BACKGROUND",
        "FOREGROUND",
      ]),
  });

function rowsOf<T>(
  value: unknown,
): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (
    value &&
    typeof value === "object" &&
    "rows" in value &&
    Array.isArray(
      (value as { rows?: unknown }).rows,
    )
  ) {
    return (
      value as { rows: T[] }
    ).rows;
  }

  return [];
}

export async function POST(
  request: NextRequest,
) {
  const parsed =
    bodySchema.safeParse(
      await request.json()
        .catch(() => null),
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        acknowledged: false,
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const acknowledged =
    rowsOf<{
      id: string;
    }>(
      await getDb().execute(sql`
        with displayed as (
          update guardian_push_outbox outbox
          set
            device_displayed_at = coalesce(
              outbox.device_displayed_at,
              now()
            ),
            updated_at = now()
          where outbox.id = ${parsed.data.outboxId}::uuid
            and outbox.delivery_receipt_token =
                ${parsed.data.receiptToken}::uuid
          returning
            outbox.id,
            outbox.school_id,
            outbox.guardian_id,
            outbox.device_id,
            outbox.presence_event_id
        ),
        receipt as (
          insert into guardian_push_delivery_receipts (
            school_id,
            guardian_id,
            browser_registration_id,
            presence_event_id,
            display_source,
            displayed_at,
            created_at
          )
          select
            displayed.school_id,
            displayed.guardian_id,
            device.browser_registration_id,
            displayed.presence_event_id,
            ${parsed.data.source},
            now(),
            now()
          from displayed
          join guardian_push_devices device
            on device.id = displayed.device_id
           and device.school_id = displayed.school_id
          where displayed.presence_event_id is not null
            and device.browser_registration_id is not null
          on conflict (
            browser_registration_id,
            presence_event_id
          ) do update set
            displayed_at = least(
              guardian_push_delivery_receipts.displayed_at,
              excluded.displayed_at
            )
          returning id
        )
        select displayed.id::text as id
        from displayed
      `),
    ).length > 0;

  return NextResponse.json(
    {
      acknowledged,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
