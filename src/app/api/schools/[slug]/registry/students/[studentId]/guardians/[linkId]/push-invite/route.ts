import {
  createHash,
  randomBytes,
} from "node:crypto";
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
  registryAuthErrorResponse,
  registryNoStoreHeaders,
  requireRegistryAdmin,
} from "@/server/registry/http";
import {
  consumePasskeyStepUpGrantWithId,
} from "@/server/auth/passkey-step-up";

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

export async function POST(
  request: NextRequest,
  context: {
    params:
      Promise<{
        slug: string;
        studentId: string;
        linkId: string;
      }>;
  },
) {
  const {
    slug,
    studentId,
    linkId,
  } =
    await context.params;

  try {
    const access =
      await requireRegistryAdmin(
        slug,
      );
    const db =
      getDb();

    const relation =
      rowsOf<{
        id: string;
        has_prior_invite:
          boolean;
      }>(
        await db.execute(sql`
          select
            link.id,
            exists (
              select 1
              from guardian_push_enrollment_links invite
              where
                invite.school_id =
                  link.school_id
                and invite.student_guardian_link_id =
                  link.id
            ) as has_prior_invite
          from student_guardians link
          join guardians guardian
            on guardian.school_id =
               link.school_id
           and guardian.id =
               link.guardian_id
           and guardian.status =
               'ACTIVE'::guardian_status
          where
            link.school_id =
              ${access.school.id}::uuid
            and link.student_id =
              ${studentId}::uuid
            and link.id =
              ${linkId}::uuid
          limit 1
        `),
      )[0];

    if (!relation) {
      return NextResponse.json(
        {
          message:
            "Student guardian relationship not found.",
        },
        {
          status: 404,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    if (
      relation.has_prior_invite
    ) {
      const grantToken =
        request.headers.get(
          "x-casa-passkey-step-up",
        );
      const grantId =
        grantToken
          ? await consumePasskeyStepUpGrantWithId({
              token:
                grantToken,
              access,
              action:
                "SECURITY_SETTINGS",
            })
          : null;

      if (!grantId) {
        return NextResponse.json(
          {
            message:
              "Resetting or reissuing a guardian notification setup link requires Passkey confirmation.",
            code:
              "PASSKEY_STEP_UP_REQUIRED",
          },
          {
            status: 403,
            headers:
              registryNoStoreHeaders,
          },
        );
      }
    }

    const token =
      `CASAPUSH1.${randomBytes(
        32,
      ).toString(
        "base64url",
      )}`;
    const tokenHash =
      createHash(
        "sha256",
      )
        .update(
          token,
          "utf8",
        )
        .digest(
          "hex",
        );

    const result =
      await db
        .execute(sql`
          with relation as (
            select
              link.id,
              link.guardian_id,
              student.home_branch_id
            from student_guardians link
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
             and guardian.status =
                 'ACTIVE'::guardian_status
            where
              link.school_id =
                ${access.school.id}::uuid
              and link.student_id =
                ${studentId}::uuid
              and link.id =
                ${linkId}::uuid
            limit 1
          ),
          old_link as (
            update guardian_push_enrollment_links
            set
              revoked_at =
                now()
            where
              school_id =
                ${access.school.id}::uuid
              and student_guardian_link_id =
                ${linkId}::uuid
              and claimed_at is null
              and revoked_at is null
            returning id
          )
          insert into guardian_push_enrollment_links (
            school_id,
            branch_id,
            student_id,
            guardian_id,
            student_guardian_link_id,
            token_hash,
            created_by_membership_id,
            expires_at,
            created_at
          )
          select
            ${access.school.id}::uuid,
            relation.home_branch_id,
            ${studentId}::uuid,
            relation.guardian_id,
            relation.id,
            ${tokenHash},
            ${access.membership.id}::uuid,
            now() + interval '48 hours',
            now()
          from relation
          returning id, expires_at
        `);

    if (
      rowsOf<{
        id: string;
        expires_at: string;
      }>(
        result,
      ).length !==
      1
    ) {
      return NextResponse.json(
        {
          message:
            "Student guardian relationship not found.",
        },
        {
          status: 404,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const created =
      rowsOf<{
        id: string;
        expires_at: string;
      }>(result)[0];

    return NextResponse.json(
      {
        oneTimeUrl:
          `${request.nextUrl.origin}/guardian-notifications/${encodeURIComponent(
            token,
          )}`,
        expiresAt:
          created.expires_at,
      },
      {
        status: 201,
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (
    error
  ) {
    const auth =
      registryAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    throw error;
  }
}
