import {
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import sharp from "sharp";

import {
  getDb,
} from "@/db";
import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  putPrivateCardObject,
} from "@/server/card-production/storage";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";

export const dynamic =
  "force-dynamic";

const noStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate",
} as const;

function rowsOf<T>(
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(
      (
        result as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      result as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

function errorResponse(
  error: unknown,
) {
  if (
    error instanceof
      AuthRequiredError
  ) {
    return NextResponse.json(
      {
        message:
          "Authentication required.",
      },
      {
        status: 401,
        headers:
          noStoreHeaders,
      },
    );
  }

  if (
    error instanceof
      SchoolAccessDeniedError
  ) {
    return NextResponse.json(
      {
        message:
          "Notification branding access denied.",
      },
      {
        status: 403,
        headers:
          noStoreHeaders,
      },
    );
  }

  return null;
}

export async function GET(
  _request: NextRequest,
  context: {
    params:
      Promise<{
        slug: string;
      }>;
  },
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
      );
    const visible =
      await listVisibleBranches(
        slug,
      );
    const db =
      getDb();

    const schoolBranding =
      rowsOf<{
        updated_at:
          string |
          Date;
      }>(
        await db.execute(sql`
          select
            updated_at
          from school_notification_branding
          where
            school_id =
              ${access.school.id}::uuid
          limit 1
        `),
      )[0];

    const branchBranding =
      rowsOf<{
        branch_id: string;
        updated_at:
          string |
          Date;
      }>(
        await db.execute(sql`
          select
            branch_id::text
              as branch_id,
            updated_at
          from school_branch_notification_branding
          where
            school_id =
              ${access.school.id}::uuid
        `),
      );

    const byBranch =
      new Map(
        branchBranding.map(
          (
            row,
          ) => [
            row.branch_id,
            row,
          ],
        ),
      );
    const schoolVersion =
      schoolBranding
        ? encodeURIComponent(
            String(
              schoolBranding.updated_at,
            ),
          )
        : "fallback";

    return NextResponse.json(
      {
        organizationAdmin:
          visible.organizationAdmin,
        school: {
          id:
            access.school.id,
          name:
            access.school.name,
          schoolLogoConfigured:
            Boolean(
              schoolBranding,
            ),
          logoUrl:
            `/api/public/schools/${encodeURIComponent(
              access.school.id,
            )}/notification-logo?v=${schoolVersion}`,
        },
        branches:
          (
            visible.branches as
              Array<{
                id: unknown;
                name: unknown;
                code: unknown;
              }>
          ).map(
            (
              branch,
            ) => {
              const id =
                String(
                  branch.id,
                );
              const branding =
                byBranch.get(
                  id,
                );
              const version =
                branding
                  ? encodeURIComponent(
                      String(
                        branding.updated_at,
                      ),
                    )
                  : schoolVersion;

              return {
                id,
                name:
                  String(
                    branch.name,
                  ),
                code:
                  String(
                    branch.code,
                  ),
                branchLogoConfigured:
                  Boolean(
                    branding,
                  ),
                logoUrl:
                  `/api/public/schools/${encodeURIComponent(
                    access.school.id,
                  )}/notification-logo?branchId=${encodeURIComponent(
                    id,
                  )}&v=${version}`,
              };
            },
          ),
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      errorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}

export async function POST(
  request: NextRequest,
  context: {
    params:
      Promise<{
        slug: string;
      }>;
  },
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
        ],
      );
    const visible =
      await listVisibleBranches(
        slug,
      );
    const form =
      await request.formData();
    const file =
      form.get(
        "logo",
      );
    const scope =
      String(
        form.get(
          "scope",
        ) ?? "",
      );
    const branchIdRaw =
      String(
        form.get(
          "branchId",
        ) ?? "",
      ).trim();

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          message:
            "Choose a notification logo.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders,
        },
      );
    }

    if (
      file.size >
      3 * 1024 * 1024
    ) {
      return NextResponse.json(
        {
          message:
            "Logo must be 3 MB or smaller.",
        },
        {
          status: 413,
          headers:
            noStoreHeaders,
        },
      );
    }

    const branch =
      scope ===
        "BRANCH"
        ? (
            visible.branches as
              Array<{
                id: string;
                name: string;
              }>
          ).find(
            (candidate) =>
              candidate.id ===
              branchIdRaw,
          )
        : null;

    if (
      scope ===
        "SCHOOL"
    ) {
      if (
        !visible.organizationAdmin
      ) {
        return NextResponse.json(
          {
            message:
              "Only organization authority can set the whole-school fallback logo.",
          },
          {
            status: 403,
            headers:
              noStoreHeaders,
          },
        );
      }
    } else if (
      scope ===
        "BRANCH"
    ) {
      if (!branch) {
        return NextResponse.json(
          {
            message:
              "Select a campus within your notification-branding scope.",
          },
          {
            status: 403,
            headers:
              noStoreHeaders,
          },
        );
      }
    } else {
      return NextResponse.json(
        {
          message:
            "Choose a valid notification-logo scope.",
        },
        {
          status: 400,
          headers:
            noStoreHeaders,
        },
      );
    }

    const input =
      Buffer.from(
        await file.arrayBuffer(),
      );
    const png =
      await sharp(input)
        .resize(
          512,
          512,
          {
            fit: "contain",
            background: {
              r: 255,
              g: 255,
              b: 255,
              alpha: 0,
            },
          },
        )
        .png()
        .toBuffer();

    if (
      scope ===
        "SCHOOL"
    ) {
      const key =
        `schools/${access.school.id}/notifications/logo.png`;

      await putPrivateCardObject({
        key,
        body: png,
        contentType:
          "image/png",
      });

      await getDb().execute(sql`
        insert into school_notification_branding (
          school_id,
          logo_object_key,
          logo_content_type,
          updated_by_membership_id,
          created_at,
          updated_at
        )
        values (
          ${access.school.id}::uuid,
          ${key},
          'image/png',
          ${access.membership.id}::uuid,
          now(),
          now()
        )
        on conflict (school_id)
        do update set
          logo_object_key =
            excluded.logo_object_key,
          logo_content_type =
            excluded.logo_content_type,
          updated_by_membership_id =
            excluded.updated_by_membership_id,
          updated_at = now()
      `);

      return NextResponse.json(
        {
          uploaded: true,
          scope:
            "SCHOOL",
          logoUrl:
            `/api/public/schools/${encodeURIComponent(
              access.school.id,
            )}/notification-logo`,
        },
        {
          headers:
            noStoreHeaders,
        },
      );
    }

    const branchId =
      branch!.id;
    const key =
      `schools/${access.school.id}/notifications/branches/${branchId}/logo.png`;

    await putPrivateCardObject({
      key,
      body: png,
      contentType:
        "image/png",
    });

    await getDb().execute(sql`
      insert into school_branch_notification_branding (
        branch_id,
        school_id,
        logo_object_key,
        logo_content_type,
        updated_by_membership_id,
        created_at,
        updated_at
      )
      values (
        ${branchId}::uuid,
        ${access.school.id}::uuid,
        ${key},
        'image/png',
        ${access.membership.id}::uuid,
        now(),
        now()
      )
      on conflict (branch_id)
      do update set
        school_id =
          excluded.school_id,
        logo_object_key =
          excluded.logo_object_key,
        logo_content_type =
          excluded.logo_content_type,
        updated_by_membership_id =
          excluded.updated_by_membership_id,
        updated_at = now()
    `);

    return NextResponse.json(
      {
        uploaded: true,
        scope:
          "BRANCH",
        branch: {
          id:
            branchId,
          name:
            branch!.name,
        },
        logoUrl:
          `/api/public/schools/${encodeURIComponent(
            access.school.id,
          )}/notification-logo?branchId=${encodeURIComponent(
            branchId,
          )}`,
      },
      {
        headers:
          noStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      errorResponse(
        error,
      );
    if (response) {
      return response;
    }
    throw error;
  }
}
