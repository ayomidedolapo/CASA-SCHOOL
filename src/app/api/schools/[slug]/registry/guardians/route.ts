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
        notificationsEnabled:
          sql<boolean>`exists (
            select 1
            from guardian_push_devices device
            where
              device.school_id =
                ${guardians.schoolId}
              and device.guardian_id =
                ${guardians.id}
              and device.status =
                'ACTIVE'
          )`.as(
            "notificationsEnabled",
          ),
      })
      .from(guardians)
      .where(whereCondition)
      .orderBy(
        asc(
          guardians.fullName,
        ),
      )
      .limit(100);

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
        guardians: rows,
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

    throw error;
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