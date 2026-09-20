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
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  putPrivateCardObject,
} from "@/server/card-production/storage";

export const dynamic =
  "force-dynamic";

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
  const access =
    await requireSchoolRole(
      slug,
      [
        "OWNER",
        "ADMIN",
      ],
    );
  const form =
    await request.formData();
  const file =
    form.get(
      "logo",
    );

  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        message:
          "Choose a school logo.",
      },
      { status: 400 },
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
      { status: 413 },
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
      logoUrl:
        `/api/public/schools/${encodeURIComponent(
          access.school.id,
        )}/notification-logo`,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
