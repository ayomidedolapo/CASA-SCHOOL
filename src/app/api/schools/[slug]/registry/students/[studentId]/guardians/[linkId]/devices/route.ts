import {
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getDb,
} from "@/db";
import {
  consumePasskeyStepUpGrantWithId,
} from "@/server/auth/passkey-step-up";
import {
  registryAuthErrorResponse,
  registryDatabaseErrorResponse,
  registryNoStoreHeaders,
  requireRegistryOperator,
} from "@/server/registry/http";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
    linkId: string;
  }>;
}

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
    Array.isArray((value as { rows?: unknown }).rows)
  ) {
    return (value as { rows: T[] }).rows;
  }
  return [];
}

function platformLabel(userAgent: string | null) {
  const value = userAgent ?? "";
  if (/Android/i.test(value)) return "Android";
  if (/iPhone|iPad|iPod/i.test(value)) return "iPhone/iPad";
  if (/Windows/i.test(value)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(value)) return "macOS";
  if (/Linux/i.test(value)) return "Linux";
  return "Device";
}

function browserLabel(userAgent: string | null) {
  const value = userAgent ?? "";
  if (/Edg/i.test(value)) return "Edge";
  if (/Firefox|FxiOS/i.test(value)) return "Firefox";
  if (/SamsungBrowser/i.test(value)) return "Samsung Internet";
  if (/Chrome|CriOS/i.test(value)) return "Chrome/Chromium";
  if (/Safari/i.test(value)) return "Safari";
  return "Browser";
}

async function relationshipContext(
  slug: string,
  studentId: string,
  linkId: string,
) {
  const access =
    await requireRegistryOperator(
      slug,
    );
  const visibility =
    await listVisibleBranches(
      slug,
    );
  const visibleBranchIds =
    new Set(
      (
        visibility.branches as
          Array<{ id: string }>
      ).map(
        (branch) =>
          String(branch.id),
      ),
    );

  const relation =
    rowsOf<{
      guardian_id: string;
      home_branch_id: string | null;
    }>(
      await getDb().execute(sql`
        select
          link.guardian_id::text
            as guardian_id,
          student.home_branch_id::text
            as home_branch_id
        from student_guardians link
        join students student
          on student.school_id = link.school_id
         and student.id = link.student_id
        where
          link.school_id = ${access.school.id}::uuid
          and link.student_id = ${studentId}::uuid
          and link.id = ${linkId}::uuid
        limit 1
      `),
    )[0];

  if (!relation) {
    return {
      access,
      relation: null,
      error: NextResponse.json(
        { message: "Student guardian relationship not found." },
        { status: 404, headers: registryNoStoreHeaders },
      ),
    };
  }

  if (
    !relation.home_branch_id ||
    !visibleBranchIds.has(
      relation.home_branch_id,
    )
  ) {
    return {
      access,
      relation,
      error: NextResponse.json(
        { message: "This guardian notification device belongs to another campus." },
        { status: 403, headers: registryNoStoreHeaders },
      ),
    };
  }

  return { access, relation, error: null };
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { slug, studentId, linkId } =
    await context.params;

  try {
    const resolved =
      await relationshipContext(
        slug,
        studentId,
        linkId,
      );
    if (resolved.error) return resolved.error;

    const devices =
      rowsOf<{
        id: string;
        status: string;
        user_agent: string | null;
        last_seen_at: Date | string | null;
        created_at: Date | string;
        updated_at: Date | string;
      }>(
        await getDb().execute(sql`
          select
            device.id::text,
            device.status,
            device.user_agent,
            device.last_seen_at,
            device.created_at,
            device.updated_at
          from guardian_push_devices device
          where
            device.school_id = ${resolved.access.school.id}::uuid
            and device.student_id = ${studentId}::uuid
            and device.guardian_id = ${resolved.relation!.guardian_id}::uuid
            and device.student_guardian_link_id = ${linkId}::uuid
          order by
            case when device.status = 'ACTIVE' then 0 else 1 end,
            device.last_seen_at desc nulls last,
            device.created_at desc
        `),
      );

    return NextResponse.json(
      {
        devices: devices.map((device) => ({
          id: device.id,
          status: device.status,
          platform: platformLabel(device.user_agent),
          browser: browserLabel(device.user_agent),
          lastSeenAt: device.last_seen_at,
          createdAt: device.created_at,
          updatedAt: device.updated_at,
        })),
      },
      { headers: registryNoStoreHeaders },
    );
  } catch (error) {
    const authResponse = registryAuthErrorResponse(error);
    if (authResponse) return authResponse;
    const databaseResponse = registryDatabaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;
    throw error;
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug, studentId, linkId } =
    await context.params;

  try {
    let body: unknown = null;
    try { body = await request.json(); } catch { body = null; }
    const parsed =
      body && typeof body === "object"
        ? body as { action?: unknown; deviceId?: unknown }
        : {};

    if (
      parsed.action !== "DISABLE" ||
      typeof parsed.deviceId !== "string" ||
      !parsed.deviceId.trim()
    ) {
      return NextResponse.json(
        { message: "Invalid guardian notification device action." },
        { status: 400, headers: registryNoStoreHeaders },
      );
    }

    const resolved =
      await relationshipContext(
        slug,
        studentId,
        linkId,
      );
    if (resolved.error) return resolved.error;

    const grantToken =
      request.headers.get(
        "x-casa-passkey-step-up",
      );
    const grantId =
      grantToken
        ? await consumePasskeyStepUpGrantWithId({
            token: grantToken,
            access: resolved.access,
            action: "SECURITY_SETTINGS",
          })
        : null;

    if (!grantId) {
      return NextResponse.json(
        {
          message: "Disabling a guardian notification device requires Passkey confirmation.",
          code: "PASSKEY_STEP_UP_REQUIRED",
        },
        { status: 428, headers: registryNoStoreHeaders },
      );
    }

    const updated =
      rowsOf<{ id: string; status: string }>(
        await getDb().execute(sql`
          update guardian_push_devices
          set
            status = 'DISABLED',
            updated_at = now()
          where
            id = ${parsed.deviceId.trim()}::uuid
            and school_id = ${resolved.access.school.id}::uuid
            and student_id = ${studentId}::uuid
            and guardian_id = ${resolved.relation!.guardian_id}::uuid
            and student_guardian_link_id = ${linkId}::uuid
          returning id::text, status
        `),
      )[0];

    if (!updated) {
      return NextResponse.json(
        { message: "Guardian notification device not found for this student relationship." },
        { status: 404, headers: registryNoStoreHeaders },
      );
    }

    return NextResponse.json(
      { updated: true, device: updated },
      { headers: registryNoStoreHeaders },
    );
  } catch (error) {
    const authResponse = registryAuthErrorResponse(error);
    if (authResponse) return authResponse;
    const databaseResponse = registryDatabaseErrorResponse(error);
    if (databaseResponse) return databaseResponse;
    throw error;
  }
}
