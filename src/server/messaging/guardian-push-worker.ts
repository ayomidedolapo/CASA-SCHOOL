import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  emitCasaOperationalNotificationBestEffort,
} from "@/server/internal/operational-notifications";
import {
  reconcileRecentGuardianPresencePushes,
} from "./guardian-presence-push";
import { sendFcmToFid } from "./firebase-fcm";

type PushRow = {
  id: string;
  school_id: string;
  branch_id: string | null;
  device_id: string;
  firebase_installation_id: string;
  title: string;
  body: string;
  icon_url: string | null;
  click_url: string | null;
  payload: Record<string, unknown> | null;
  attempt_count: number;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

function stringData(payload: Record<string, unknown> | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (value === null || value === undefined) continue;
    result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return result;
}

function publicAppOrigin() {
  const configured =
    process.env
      .NEXT_PUBLIC_APP_URL
      ?.trim()
      .replace(
        /\/+$/,
        "",
      );

  if (configured) {
    return configured;
  }

  const vercelHost =
    process.env
      .VERCEL_PROJECT_PRODUCTION_URL
      ?.trim()
      .replace(
        /^https?:\/\//i,
        "",
      )
      .replace(
        /\/+$/,
        "",
      );

  return vercelHost
    ? `https://${vercelHost}`
    : "https://casa-school.vercel.app";
}

function absolutePublicUrl(
  value:
    string | null,
) {
  if (!value) {
    return null;
  }

  try {
    return new URL(
      value,
    ).toString();
  } catch {
    return new URL(
      value,
      `${publicAppOrigin()}/`,
    ).toString();
  }
}

export async function runGuardianPushOutbox(
  input: {
    limit?: number;
    schoolId?: string;
    presenceEventId?: string;
  } = {},
) {
  const db = getDb();
  const limit =
    Math.min(
      100,
      Math.max(
        1,
        input.limit ?? 50,
      ),
    );

  const reconciled =
    await reconcileRecentGuardianPresencePushes({
      schoolId:
        input.schoolId,
      presenceEventId:
        input.presenceEventId,
      lookbackMinutes:
        120,
      limit:
        Math.min(
          200,
          limit * 4,
        ),
    });

  const schoolFilter =
    input.schoolId
      ? sql`and outbox.school_id = ${input.schoolId}::uuid`
      : sql``;
  const presenceEventFilter =
    input.presenceEventId
      ? sql`and outbox.presence_event_id = ${input.presenceEventId}::uuid`
      : sql``;

  const claimed =
    rowsOf<PushRow>(
      await db.execute(sql`
    with due as (
      select
        outbox.id,
        device.branch_id
      from guardian_push_outbox outbox
      join guardian_push_devices device
        on device.id =
           outbox.device_id
       and device.school_id =
           outbox.school_id
       and device.student_id =
           outbox.student_id
       and device.guardian_id =
           outbox.guardian_id
       and device.firebase_installation_id =
           outbox.firebase_installation_id
       and device.status =
           'ACTIVE'
      where outbox.status in ('PENDING', 'RETRY')
        and outbox.available_at <= now()
        ${schoolFilter}
        ${presenceEventFilter}
      order by outbox.available_at asc, outbox.created_at asc
      limit ${limit}
      for update skip locked
    )
    update guardian_push_outbox outbox
    set
      status = 'PROCESSING',
      locked_at = now(),
      attempt_count = outbox.attempt_count + 1,
      updated_at = now()
    from due
    where outbox.id = due.id
    returning
      outbox.id::text,
      outbox.school_id::text,
      due.branch_id::text
        as branch_id,
      outbox.device_id::text,
      outbox.firebase_installation_id,
      outbox.title,
      outbox.body,
      outbox.icon_url,
      outbox.click_url,
      outbox.payload,
      outbox.attempt_count
  `),
    );

  let sent = 0;
  let retried = 0;
  let failed = 0;
  const failedBySchool =
    new Map<string, number>();

  for (const row of claimed) {
    try {
      const delivery = await sendFcmToFid({
        fid: row.firebase_installation_id,
        title: row.title,
        body: row.body,
        iconUrl:
          absolutePublicUrl(
            row.icon_url,
          ) ??
          `${publicAppOrigin()}/api/public/schools/${encodeURIComponent(
            row.school_id,
          )}/notification-logo${
            row.branch_id
              ? `?branchId=${encodeURIComponent(
                  row.branch_id,
                )}`
              : ""
          }`,
        clickUrl:
          absolutePublicUrl(
            row.click_url,
          ) ??
          publicAppOrigin(),
        data: stringData(row.payload),
      });

      if (delivery.ok) {
        sent += 1;
        await db.execute(sql`
          update guardian_push_outbox
          set
            status = 'SENT',
            sent_at = now(),
            provider_message_id = ${delivery.messageId},
            last_error = null,
            locked_at = null,
            updated_at = now()
          where id = ${row.id}::uuid
            and status = 'PROCESSING'
        `);
        continue;
      }

      const terminalFailure = row.attempt_count >= 5;
      const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, row.attempt_count - 1)));
      const nextAttempt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
      if (terminalFailure) {
        failed += 1;
        failedBySchool.set(
          row.school_id,
          (failedBySchool.get(
            row.school_id,
          ) ?? 0) + 1,
        );
      } else {
        retried += 1;
      }

      await db.execute(sql`
        update guardian_push_outbox
        set
          status = ${terminalFailure ? "FAILED" : "RETRY"},
          available_at = ${nextAttempt}::timestamptz,
          last_error = ${delivery.error?.slice(0, 1000) ?? `FCM HTTP ${delivery.status}`},
          locked_at = null,
          updated_at = now()
        where id = ${row.id}::uuid
          and status = 'PROCESSING'
      `);
    } catch (error) {
      const terminalFailure = row.attempt_count >= 5;
      const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, row.attempt_count - 1)));
      const nextAttempt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
      if (terminalFailure) {
        failed += 1;
        failedBySchool.set(
          row.school_id,
          (failedBySchool.get(
            row.school_id,
          ) ?? 0) + 1,
        );
      } else {
        retried += 1;
      }
      const message = error instanceof Error ? error.message : "FCM worker failure";

      await db.execute(sql`
        update guardian_push_outbox
        set
          status = ${terminalFailure ? "FAILED" : "RETRY"},
          available_at = ${nextAttempt}::timestamptz,
          last_error = ${message.slice(0, 1000)},
          locked_at = null,
          updated_at = now()
        where id = ${row.id}::uuid
          and status = 'PROCESSING'
      `);
    }
  }

  for (
    const [
      schoolId,
      failedCount,
    ] of failedBySchool
  ) {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "GUARDIAN_PUSH_DELIVERY_FAILED",
      scope: {
        kind:
          "SCHOOL",
        schoolId,
      },
      title:
        "Guardian push delivery failed",
      body:
        `${failedCount} guardian push notification(s) reached terminal failure during the latest delivery run.`,
      actionUrl:
        "/internal/notifications",
      dedupKey:
        `guardian-push-terminal-failure:${schoolId}`,
      payload: {
        failedCount,
      },
    });
  }

  return {
    reconciled,
    claimed:
      claimed.length,
    sent,
    retried,
    failed,
  };
}
