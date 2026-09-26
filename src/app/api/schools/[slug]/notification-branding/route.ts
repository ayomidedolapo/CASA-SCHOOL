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
