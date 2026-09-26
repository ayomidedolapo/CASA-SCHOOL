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

async function hasActiveBranchAdminScope(
  schoolId: string,
  membershipId: string,
) {
  const rows = rowsOf<{ id: string }>(
    await getDb().execute(sql`
      select assignment.id::text as id
      from school_branch_admin_assignments assignment
      join school_branches branch
        on branch.school_id = assignment.school_id
       and branch.id = assignment.branch_id
      where assignment.school_id = ${schoolId}::uuid
        and assignment.membership_id = ${membershipId}::uuid
        and assignment.is_active = true
        and branch.status = 'ACTIVE'::school_branch_status
      limit 1
    `),
  );

  return rows.length > 0;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  try {
    const access = await requireSchoolAccess(slug);
    await reconcileSchoolMemberNotifications({
      slug,
      schoolId: access.school.id,
      membershipId: access.membership.id,
    });
    const db = getDb();
    const branchScoped = await hasActiveBranchAdminScope(
      access.school.id,
      access.membership.id,
    );

    const notifications = rowsOf(await db.execute(sql`
      select
        notification.id::text,
        notification.branch_id::text as "branchId",
        notification.event_type as "eventType",
        notification.title,
        notification.body,
        notification.action_url as "actionUrl",
        notification.payload,
        notification.read_at as "readAt",
        notification.created_at as "createdAt"
      from casa_in_app_notifications notification
      where notification.school_id = ${access.school.id}::uuid
        and notification.recipient_school_membership_id = ${access.membership.id}::uuid
        and (
          ${!branchScoped}
          or notification.branch_id is null
          or exists (
            select 1
            from school_branch_admin_assignments assignment
            join school_branches branch
              on branch.school_id = assignment.school_id
             and branch.id = assignment.branch_id
            where assignment.school_id = ${access.school.id}::uuid
              and assignment.membership_id = ${access.membership.id}::uuid
              and assignment.is_active = true
              and branch.status = 'ACTIVE'::school_branch_status
              and assignment.branch_id = notification.branch_id
          )
        )
      order by notification.created_at desc
      limit 100
    `));

    const normalized =
      notifications.map(
        (row) => {
          const item =
            row as {
              eventType?: string;
              actionUrl?: string | null;
            };
          const eventType = item.eventType ?? "";
          let actionUrl = item.actionUrl;

          if (
            !actionUrl ||
            actionUrl === `/schools/${slug}/notifications`
          ) {
            if (eventType.includes("ATTENDANCE")) {
              actionUrl = `/schools/${encodeURIComponent(slug)}/attendance`;
            } else if (
              eventType.includes("TERMINAL") ||
              eventType.includes("SCANNER")
            ) {
              actionUrl = `/schools/${encodeURIComponent(slug)}/technician`;
            } else if (
              eventType.includes("GUARDIAN") ||
              eventType.includes("BIOMETRIC") ||
              eventType.includes("STUDENT")
            ) {
              actionUrl = `/schools/${encodeURIComponent(slug)}/registry`;
            } else if (eventType.includes("PROGRESSION")) {
              actionUrl = `/schools/${encodeURIComponent(slug)}/academic`;
            } else {
              actionUrl = `/schools/${encodeURIComponent(slug)}/audit`;
            }
          }

          return {
            ...(row as Record<string, unknown>),
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
        notifications: normalized,
        unread,
      },
      { headers },
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
    const branchScoped = await hasActiveBranchAdminScope(
      access.school.id,
      access.membership.id,
    );

    if (parsed.data.markAllRead) {
      await db.execute(sql`
        update casa_in_app_notifications notification
        set read_at = coalesce(notification.read_at, now())
        where notification.school_id = ${access.school.id}::uuid
          and notification.recipient_school_membership_id = ${access.membership.id}::uuid
          and notification.read_at is null
          and (
            ${!branchScoped}
            or notification.branch_id is null
            or exists (
              select 1
              from school_branch_admin_assignments assignment
              join school_branches branch
                on branch.school_id = assignment.school_id
               and branch.id = assignment.branch_id
              where assignment.school_id = ${access.school.id}::uuid
                and assignment.membership_id = ${access.membership.id}::uuid
                and assignment.is_active = true
                and branch.status = 'ACTIVE'::school_branch_status
                and assignment.branch_id = notification.branch_id
            )
          )
      `);
    } else if (parsed.data.notificationId) {
      await db.execute(sql`
        update casa_in_app_notifications notification
        set read_at = coalesce(notification.read_at, now())
        where notification.id = ${parsed.data.notificationId}::uuid
          and notification.school_id = ${access.school.id}::uuid
          and notification.recipient_school_membership_id = ${access.membership.id}::uuid
          and (
            ${!branchScoped}
            or notification.branch_id is null
            or exists (
              select 1
              from school_branch_admin_assignments assignment
              join school_branches branch
                on branch.school_id = assignment.school_id
               and branch.id = assignment.branch_id
              where assignment.school_id = ${access.school.id}::uuid
                and assignment.membership_id = ${access.membership.id}::uuid
                and assignment.is_active = true
                and branch.status = 'ACTIVE'::school_branch_status
                and assignment.branch_id = notification.branch_id
            )
          )
      `);
    }

    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    const response = authError(error);
    if (response) return response;
    throw error;
  }
}
