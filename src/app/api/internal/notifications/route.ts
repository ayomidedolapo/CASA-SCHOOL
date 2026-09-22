import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { reconcileCasaOperationalNotifications } from "@/server/internal/operational-reconcile";
import {
  CasaInternalAccessDeniedError,
  isAuthRequiredError,
  requireCasaInternalAccess,
} from "@/server/internal/authorization";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function authError(error: unknown) {
  if (isAuthRequiredError(error)) return NextResponse.json({ message: "Authentication required." }, { status: 401, headers });
  if (error instanceof CasaInternalAccessDeniedError) return NextResponse.json({ message: "CASA internal access denied." }, { status: 403, headers });
  return null;
}

export async function GET() {
  try {
    const access = await requireCasaInternalAccess();
    await reconcileCasaOperationalNotifications();
    const db = getDb();
    const notifications = rowsOf(await db.execute(sql`
      select
        notification.id::text,
        notification.school_id::text as "schoolId",
        school.name as "schoolName",
        notification.branch_id::text as "branchId",
        branch.name as "branchName",
        notification.event_type as "eventType",
        coalesce(
          notification.payload #>>
            '{operational,severity}',
          'INFO'
        ) as severity,
        coalesce(
          notification.payload #>>
            '{operational,category}',
          'PLATFORM_HEALTH'
        ) as category,
        notification.title,
        notification.body,
        notification.action_url as "actionUrl",
        notification.payload,
        notification.read_at as "readAt",
        notification.created_at as "createdAt"
      from casa_in_app_notifications notification
      left join schools school on school.id = notification.school_id
      left join school_branches branch
        on branch.school_id = notification.school_id
       and branch.id = notification.branch_id
      where notification.recipient_internal_membership_id = ${access.membership.id}::uuid
      order by notification.created_at desc
      limit 100
    `));
    const unread = notifications.filter((row) => !(row as { readAt?: unknown }).readAt).length;
    return NextResponse.json({ notifications, unread }, { headers });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    throw error;
  }
}

const patchSchema = z.object({
  notificationId: z.string().uuid().optional(),
  markAllRead: z.boolean().optional(),
}).refine((value) => Boolean(value.notificationId || value.markAllRead));

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireCasaInternalAccess();
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Invalid notification update." }, { status: 400, headers });
    const db = getDb();
    if (parsed.data.markAllRead) {
      await db.execute(sql`
        update casa_in_app_notifications
        set read_at = coalesce(read_at, now())
        where recipient_internal_membership_id = ${access.membership.id}::uuid
          and read_at is null
      `);
    } else if (parsed.data.notificationId) {
      await db.execute(sql`
        update casa_in_app_notifications
        set read_at = coalesce(read_at, now())
        where id = ${parsed.data.notificationId}::uuid
          and recipient_internal_membership_id = ${access.membership.id}::uuid
      `);
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    throw error;
  }
}
