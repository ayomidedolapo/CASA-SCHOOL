import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { requireSchoolAccess, AuthRequiredError, SchoolAccessDeniedError } from "@/server/auth/authorization";
import { reconcileSchoolMemberNotifications } from "@/server/notifications/school-activity";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, no-cache, must-revalidate" } as const;

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows?: unknown }).rows)) return (result as { rows: T[] }).rows;
  return [];
}

function authError(error: unknown) {
  if (error instanceof AuthRequiredError) return NextResponse.json({ message: "Authentication required." }, { status: 401, headers });
  if (error instanceof SchoolAccessDeniedError) return NextResponse.json({ message: "School notification access denied." }, { status: 403, headers });
  return null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const access = await requireSchoolAccess(slug);
    await reconcileSchoolMemberNotifications({
      slug,
      schoolId:
        access.school.id,
      membershipId:
        access.membership.id,
    });
    const db = getDb();
    const notifications = rowsOf(await db.execute(sql`
      select
        id::text,
        branch_id::text as "branchId",
        event_type as "eventType",
        title,
        body,
        action_url as "actionUrl",
        payload,
        read_at as "readAt",
        created_at as "createdAt"
      from casa_in_app_notifications
      where school_id = ${access.school.id}::uuid
        and recipient_school_membership_id = ${access.membership.id}::uuid
      order by created_at desc
      limit 100
    `));
    const normalized =
      notifications.map(
        (row) => {
          const item =
            row as {
              eventType?:
                string;
              actionUrl?:
                string | null;
            };
          const eventType =
            item.eventType ??
            "";
          let actionUrl =
            item.actionUrl;

          if (
            !actionUrl ||
            actionUrl ===
              `/schools/${slug}/notifications`
          ) {
            if (
              eventType.includes(
                "ATTENDANCE",
              )
            ) {
              actionUrl =
                `/schools/${encodeURIComponent(
                  slug,
                )}/attendance`;
            } else if (
              eventType.includes(
                "TERMINAL",
              ) ||
              eventType.includes(
                "SCANNER",
              )
            ) {
              actionUrl =
                `/schools/${encodeURIComponent(
                  slug,
                )}/technician`;
            } else if (
              eventType.includes(
                "GUARDIAN",
              ) ||
              eventType.includes(
                "BIOMETRIC",
              ) ||
              eventType.includes(
                "STUDENT",
              )
            ) {
              actionUrl =
                `/schools/${encodeURIComponent(
                  slug,
                )}/registry`;
            } else if (
              eventType.includes(
                "PROGRESSION",
              )
            ) {
              actionUrl =
                `/schools/${encodeURIComponent(
                  slug,
                )}/academic`;
            } else {
              actionUrl =
                `/schools/${encodeURIComponent(
                  slug,
                )}/audit`;
            }
          }

          return {
            ...(
              row as Record<
                string,
                unknown
              >
            ),
            actionUrl,
          };
        },
      );

    const unread =
      normalized.filter(
        (row) =>
          !(row as {
            readAt?: unknown;
          }).readAt,
      ).length;

    return NextResponse.json(
      {
        notifications:
          normalized,
        unread,
      },
      {
        headers,
      },
    );
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    throw error;
  }
}

const patchSchema = z.object({ notificationId: z.string().uuid().optional(), markAllRead: z.boolean().optional() }).refine((value) => Boolean(value.notificationId || value.markAllRead));

export async function PATCH(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const access = await requireSchoolAccess(slug);
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ message: "Invalid notification update." }, { status: 400, headers });
    const db = getDb();
    if (parsed.data.markAllRead) {
      await db.execute(sql`
        update casa_in_app_notifications
        set read_at = coalesce(read_at, now())
        where school_id = ${access.school.id}::uuid
          and recipient_school_membership_id = ${access.membership.id}::uuid
          and read_at is null
      `);
    } else if (parsed.data.notificationId) {
      await db.execute(sql`
        update casa_in_app_notifications
        set read_at = coalesce(read_at, now())
        where id = ${parsed.data.notificationId}::uuid
          and school_id = ${access.school.id}::uuid
          and recipient_school_membership_id = ${access.membership.id}::uuid
      `);
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    throw error;
  }
}
