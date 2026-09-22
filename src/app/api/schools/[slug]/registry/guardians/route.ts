import {
  and,
  asc,
  count,
  eq,
  ilike,
  or,
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  guardians,
} from "@/db/schema";
import {
  registryAuthErrorResponse,
  registryDatabaseErrorResponse,
  registryNoStoreHeaders,
  requireRegistryOperator,
} from "@/server/registry/http";
import {
  guardianCreateSchema,
} from "@/server/registry/validation";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

  try {
    const access =
      await requireRegistryOperator(slug);
    const db = getDb();
    const q =
      request.nextUrl.searchParams
        .get("q")
        ?.trim()
        .slice(0, 100) ?? "";

    const searchCondition = q
      ? or(
          ilike(
            guardians.fullName,
            `%${q}%`,
          ),
          ilike(
            guardians.email,
            `%${q}%`,
          ),
          ilike(
            guardians.phone,
            `%${q}%`,
          ),
        )
      : undefined;

    const whereCondition =
      searchCondition
        ? and(
            eq(
              guardians.schoolId,
              access.school.id,
            ),
            searchCondition,
          )
        : eq(
            guardians.schoolId,
            access.school.id,
          );

    const rows = await db
      .select({
        id: guardians.id,
        fullName:
          guardians.fullName,
        email: guardians.email,
        phone: guardians.phone,
        status: guardians.status,
        membershipId:
          guardians.membershipId,
      })
      .from(guardians)
      .where(whereCondition)
      .orderBy(
        asc(
          guardians.fullName,
        ),
      )
      .limit(100);

    const notificationResult =
      await db.execute(sql`
        select
          sg.guardian_id,
          count(
            distinct device.id
          )::int as active_notification_devices
        from student_guardians sg
        join guardian_push_devices device
          on device.school_id =
             sg.school_id
         and device.student_guardian_link_id =
             sg.id
        where
          sg.school_id =
            ${access.school.id}::uuid
          and sg.receives_notifications = true
          and device.status = 'ACTIVE'
        group by
          sg.guardian_id
      `);

    const notificationRows =
      Array.isArray(
        notificationResult,
      )
        ? notificationResult as Array<{
            guardian_id: string;
            active_notification_devices:
              number;
          }>
        : (
            notificationResult &&
            typeof notificationResult ===
              "object" &&
            "rows" in
              notificationResult &&
            Array.isArray(
              (
                notificationResult as {
                  rows?: unknown;
                }
              ).rows,
            )
              ? (
                  notificationResult as unknown as {
                    rows: Array<{
                      guardian_id:
                        string;
                      active_notification_devices:
                        number;
                    }>;
                  }
                ).rows
              : []
          );

    const notificationCountByGuardian =
      new Map(
        notificationRows.map(
          (row) => [
            row.guardian_id,
            Number(
              row.active_notification_devices ??
                0,
            ),
          ] as const,
        ),
      );

    const guardianRows =
      rows.map(
        (row) => {
          const activeNotificationDevices =
            notificationCountByGuardian.get(
              row.id,
            ) ?? 0;

          return {
            ...row,
            notificationsEnabled:
              activeNotificationDevices >
              0,
            activeNotificationDevices,
          };
        },
      );

    const totals = await db
      .select({
        count: count(),
      })
      .from(guardians)
      .where(
        eq(
          guardians.schoolId,
          access.school.id,
        ),
      );

    return NextResponse.json(
      {
        guardians:
          guardianRows,
        total:
          Number(
            totals[0]?.count ?? 0,
          ),
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const authResponse =
      registryAuthErrorResponse(
        error,
      );

    if (authResponse) {
      return authResponse;
    }

    const databaseResponse =
      registryDatabaseErrorResponse(
        error,
      );

    if (databaseResponse) {
      return databaseResponse;
    }

    return NextResponse.json(
      {
        message:
          "Guardian registry could not be loaded.",
      },
      {
        status: 500,
        headers:
          registryNoStoreHeaders,
      },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

  try {
    const access =
      await requireRegistryOperator(slug);

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid guardian request.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const parsed =
      guardianCreateSchema.safeParse(
        body,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid guardian details.",
          issues:
            parsed.error.issues.map(
              (issue) => ({
                path:
                  issue.path.join("."),
                message:
                  issue.message,
              }),
            ),
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const db = getDb();
    const input = parsed.data;

    const inserted = await db
      .insert(guardians)
      .values({
        schoolId:
          access.school.id,
        fullName:
          input.fullName,
        email:
          input.email
            ? input.email.toLowerCase()
            : null,
        phone:
          input.phone || null,
      })
      .returning({
        id: guardians.id,
        fullName:
          guardians.fullName,
        email: guardians.email,
        phone: guardians.phone,
        status: guardians.status,
      });

    return NextResponse.json(
      {
        guardian: inserted[0],
      },
      {
        status: 201,
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const authResponse =
      registryAuthErrorResponse(
        error,
      );

    if (authResponse) {
      return authResponse;
    }

    const databaseResponse =
      registryDatabaseErrorResponse(
        error,
      );

    if (databaseResponse) {
      return databaseResponse;
    }

    throw error;
  }
}