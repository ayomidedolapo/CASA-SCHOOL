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
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

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
    const visibility =
      await listVisibleBranches(
        slug,
      );
    const visibleBranchIds =
      (
        visibility.branches as
          Array<{
            id: string;
          }>
      ).map(
        (branch) =>
          branch.id,
      );
    const db = getDb();

    if (
      visibleBranchIds.length ===
      0
    ) {
      return NextResponse.json(
        {
          guardians: [],
          total: 0,
        },
        {
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const branchScope =
      sql.join(
        visibleBranchIds.map(
          (branchId) =>
            sql`${branchId}::uuid`,
        ),
        sql`, `,
      );
    const guardianBranchCondition =
      sql<boolean>`(
        exists (
          select 1
          from student_guardians
            visible_link
          join students
            visible_student
            on visible_student.school_id =
               visible_link.school_id
           and visible_student.id =
               visible_link.student_id
          where
            visible_link.school_id =
              ${access.school.id}::uuid
            and visible_link.guardian_id =
              ${guardians.id}
            and visible_student.home_branch_id
              in (${branchScope})
        )
        or (
          not exists (
            select 1
            from student_guardians
              any_link
            where
              any_link.school_id =
                ${access.school.id}::uuid
              and any_link.guardian_id =
                ${guardians.id}
          )
          and ${guardians.originBranchId}
            in (${branchScope})
        )
      )`;

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
            guardianBranchCondition,
            searchCondition,
          )
        : and(
            eq(
              guardians.schoolId,
              access.school.id,
            ),
            guardianBranchCondition,
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
        join students student
          on student.school_id =
             sg.school_id
         and student.id =
             sg.student_id
        join guardian_push_devices device
          on device.school_id =
             sg.school_id
         and device.student_guardian_link_id =
             sg.id
        where
          sg.school_id =
            ${access.school.id}::uuid
          and student.home_branch_id
            in (${branchScope})
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
        and(
          eq(
            guardians.schoolId,
            access.school.id,
          ),
          guardianBranchCondition,
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
    const visibility =
      await listVisibleBranches(
        slug,
      );
    const operationalBranches =
      visibility.branches as
        Array<{
          id: string;
          name: string;
          is_headquarters: boolean;
        }>;

    if (
      operationalBranches.length ===
      0
    ) {
      return NextResponse.json(
        {
          message:
            "No operational campus is available for this Registry operator.",
        },
        {
          status: 403,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

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
    const requestedBranchId =
      input.branchId ??
      null;
    const originBranch =
      requestedBranchId
        ? operationalBranches.find(
            (branch) =>
              branch.id ===
              requestedBranchId,
          ) ?? null
        : operationalBranches.length ===
            1
          ? operationalBranches[0]
          : null;

    if (!originBranch) {
      return NextResponse.json(
        {
          message:
            operationalBranches.length >
            1
              ? "Select the campus creating this guardian record."
              : "The selected campus is not available to this Registry operator.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const inserted = await db
      .insert(guardians)
      .values({
        schoolId:
          access.school.id,
        originBranchId:
          originBranch.id,
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