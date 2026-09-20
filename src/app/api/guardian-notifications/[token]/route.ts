import {
  createHash,
} from "node:crypto";
import {
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  z,
} from "zod";

import {
  getDb,
} from "@/db";
import {
  firebasePublicConfig,
  sendFcmToFid,
} from "@/server/messaging/firebase-fcm";

export const dynamic =
  "force-dynamic";

function rowsOf<T>(
  value: unknown,
): T[] {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value as T[];
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "rows" in value &&
    Array.isArray(
      (
        value as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      value as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

function digest(
  token: string,
) {
  return createHash(
    "sha256",
  )
    .update(
      token,
      "utf8",
    )
    .digest(
      "hex",
    );
}

const claim =
  z.object({
    fid:
      z.string()
        .trim()
        .min(10)
        .max(255),
  });

export async function GET(
  _request: NextRequest,
  context: {
    params:
      Promise<{
        token: string;
      }>;
  },
) {
  const {
    token,
  } =
    await context.params;

  const result =
    await getDb()
      .execute(sql`
        select
          link.id,
          link.school_id,
          link.branch_id,
          school.name as school_name,
          coalesce(
            branch.name,
            'Main campus'
          ) as branch_name,
          student.id as student_id,
          concat_ws(
            ' ',
            student.first_name,
            nullif(
              student.middle_name,
              ''
            ),
            student.last_name
          ) as student_name,
          guardian.id as guardian_id,
          guardian.full_name as guardian_name,
          branding.logo_object_key
        from guardian_push_enrollment_links link
        join schools school
          on school.id =
             link.school_id
        join students student
          on student.school_id =
             link.school_id
         and student.id =
             link.student_id
        join guardians guardian
          on guardian.school_id =
             link.school_id
         and guardian.id =
             link.guardian_id
        left join school_branches branch
          on branch.school_id =
             link.school_id
         and branch.id =
             link.branch_id
        left join school_notification_branding branding
          on branding.school_id =
             link.school_id
        where
          link.token_hash =
            ${digest(
              token,
            )}
          and link.claimed_at is null
          and link.revoked_at is null
          and link.expires_at > now()
        limit 1
      `);

  const row =
    rowsOf<{
      school_id: string;
      branch_id:
        string | null;
      school_name: string;
      branch_name: string;
      student_id: string;
      student_name: string;
      guardian_id: string;
      guardian_name: string;
      logo_object_key:
        string | null;
    }>(
      result,
    )[0];

  if (!row) {
    return NextResponse.json(
      {
        message:
          "This CASA notification link has expired, already been used, or was replaced.",
      },
      {
        status: 410,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const firebase =
    firebasePublicConfig();

  return NextResponse.json(
    {
      school: {
        id:
          row.school_id,
        name:
          row.school_name,
        logoUrl:
          row.logo_object_key
            ? `/api/public/schools/${encodeURIComponent(
                row.school_id,
              )}/notification-logo`
            : null,
      },
      branch: {
        id:
          row.branch_id,
        name:
          row.branch_name,
      },
      student: {
        id:
          row.student_id,
        name:
          row.student_name,
      },
      guardian: {
        id:
          row.guardian_id,
        name:
          row.guardian_name,
      },
      reason:
        "Allow notifications to receive trusted CASA alerts when this student checks in, checks out, or has an approved early departure.",
      firebase,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

export async function POST(
  request: NextRequest,
  context: {
    params:
      Promise<{
        token: string;
      }>;
  },
) {
  const {
    token,
  } =
    await context.params;

  const parsed =
    claim.safeParse(
      await request.json()
        .catch(
          () => null,
        ),
    );

  if (!parsed.success) {
    return NextResponse.json(
      {
        message:
          "Firebase registration is invalid.",
      },
      {
        status: 400,
      },
    );
  }

  const userAgent =
    request.headers
      .get(
        "user-agent",
      )
      ?.slice(
        0,
        500,
      ) ??
    null;

  const linkResult =
    await getDb()
      .execute(sql`
        select
          link.id,
          link.school_id,
          link.branch_id,
          link.student_id,
          link.guardian_id,
          link.student_guardian_link_id,
          school.name as school_name,
          coalesce(
            branch.name,
            'Main campus'
          ) as branch_name,
          concat_ws(
            ' ',
            student.first_name,
            nullif(
              student.middle_name,
              ''
            ),
            student.last_name
          ) as student_name
        from guardian_push_enrollment_links link
        join schools school
          on school.id =
             link.school_id
        join students student
          on student.school_id =
             link.school_id
         and student.id =
             link.student_id
        left join school_branches branch
          on branch.school_id =
             link.school_id
         and branch.id =
             link.branch_id
        where
          link.token_hash =
            ${digest(
              token,
            )}
          and link.claimed_at is null
          and link.revoked_at is null
          and link.expires_at > now()
        limit 1
      `);

  const link =
    rowsOf<{
      id: string;
      school_id: string;
      branch_id:
        string | null;
      student_id: string;
      guardian_id: string;
      student_guardian_link_id: string;
      school_name: string;
      branch_name: string;
      student_name: string;
    }>(
      linkResult,
    )[0];

  if (!link) {
    return NextResponse.json(
      {
        message:
          "This CASA notification link has expired, already been used, or was replaced.",
      },
      {
        status: 410,
      },
    );
  }

  await getDb()
    .execute(sql`
      insert into guardian_push_devices (
        school_id,
        branch_id,
        student_id,
        guardian_id,
        student_guardian_link_id,
        enrollment_link_id,
        firebase_installation_id,
        status,
        user_agent,
        last_seen_at,
        created_at,
        updated_at
      )
      values (
        ${link.school_id}::uuid,
        ${link.branch_id}::uuid,
        ${link.student_id}::uuid,
        ${link.guardian_id}::uuid,
        ${link.student_guardian_link_id}::uuid,
        ${link.id}::uuid,
        ${parsed.data.fid},
        'ACTIVE',
        ${userAgent},
        now(),
        now(),
        now()
      )
      on conflict (
        school_id,
        student_guardian_link_id,
        firebase_installation_id
      )
      do update set
        branch_id =
          excluded.branch_id,
        enrollment_link_id =
          excluded.enrollment_link_id,
        status =
          'ACTIVE',
        user_agent =
          excluded.user_agent,
        last_seen_at =
          now(),
        updated_at =
          now()
    `);

  const origin =
    request.nextUrl.origin;
  const test =
    await sendFcmToFid({
      fid:
        parsed.data.fid,
      title:
        `${link.school_name} · ${link.branch_name}`,
      body:
        `CASA notifications are enabled for ${link.student_name}.`,
      iconUrl:
        `${origin}/api/public/schools/${encodeURIComponent(
          link.school_id,
        )}/notification-logo`,
      clickUrl:
        origin,
      data: {
        type:
          "CASA_NOTIFICATION_ENABLED",
      },
    });

  if (!test.ok) {
    return NextResponse.json(
      {
        message:
          "CASA registered this device, but Firebase could not deliver the test notification yet. Try again; this private link is still open.",
        code:
          "FCM_TEST_DELIVERY_FAILED",
      },
      {
        status: 502,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const claimed =
    await getDb()
      .execute(sql`
        update guardian_push_enrollment_links
        set
          claimed_at =
            now()
        where
          id =
            ${link.id}::uuid
          and claimed_at is null
          and revoked_at is null
          and expires_at > now()
        returning id, student_guardian_link_id
      `);

  if (
    rowsOf<{
      id: string;
      student_guardian_link_id: string;
    }>(
      claimed,
    ).length !== 1
  ) {
    return NextResponse.json(
      {
        message:
          "This CASA notification link was completed in another browser session.",
      },
      {
        status: 409,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

    await getDb()
      .execute(sql`
        update student_guardians
        set
          receives_notifications = true,
          updated_at = now()
        where
          school_id =
            ${link.school_id}::uuid
          and id =
            ${link.student_guardian_link_id}::uuid
      `);

  return NextResponse.json(
    {
      enabled: true,
      testPushDelivered:
        true,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
