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
  consumePasskeyStepUpGrantWithId,
} from "@/server/auth/passkey-step-up";
import {
  buildTrustedSchoolLinkMessage,
} from "@/server/links/trusted-share";
import {
  sendGuardianInviteEmail,
} from "@/server/messaging/guardian-invite-email";
import {
  emitCasaOperationalNotificationBestEffort,
} from "@/server/internal/operational-notifications";
import {
  registryAuthErrorResponse,
  registryNoStoreHeaders,
  requireRegistryOperator,
} from "@/server/registry/http";

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
  request:
    NextRequest,
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
      await requireRegistryOperator(
        slug,
      );
    const db =
      getDb();

    const relation =
      rowsOf<{
        id: string;
        guardian_id: string;
        guardian_name: string;
        guardian_email:
          string | null;
        guardian_phone:
          string | null;
        home_branch_id:
          string | null;
        student_name:
          string;
        has_prior_invite:
          boolean;
      }>(
        await db.execute(sql`
          select
            link.id,
            guardian.id
              as guardian_id,
            guardian.full_name
              as guardian_name,
            guardian.email
              as guardian_email,
            guardian.phone
              as guardian_phone,
            student.home_branch_id,
            concat_ws(
              ' ',
              student.first_name,
              nullif(
                student.middle_name,
                ''
              ),
              student.last_name
            ) as student_name,
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
          join students student
            on student.school_id =
               link.school_id
           and student.id =
               link.student_id
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

    const created =
      rowsOf<{
        id: string;
        expires_at:
          string;
      }>(
        await db.execute(sql`
          with old_link as (
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
          values (
            ${access.school.id}::uuid,
            ${relation.home_branch_id}::uuid,
            ${studentId}::uuid,
            ${relation.guardian_id}::uuid,
            ${relation.id}::uuid,
            ${tokenHash},
            ${access.membership.id}::uuid,
            now() + interval '48 hours',
            now()
          )
          returning
            id,
            expires_at
        `),
      )[0];

    if (!created) {
      return NextResponse.json(
        {
          message:
            "Guardian notification setup link could not be created.",
        },
        {
          status: 500,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const oneTimeUrl =
      `${request.nextUrl.origin}/guardian-notifications/${encodeURIComponent(
        token,
      )}`;

    const shareText =
      buildTrustedSchoolLinkMessage({
        schoolName:
          access.school.name,
        recipientName:
          relation.guardian_name,
        studentName:
          relation.student_name,
        purpose:
          "Please use this private link to enable trusted school notifications, including check-in, check-out and approved early-departure alerts.",
        expiresLabel:
          "48 hours",
        url:
          oneTimeUrl,
      });

    const phoneDigits =
      relation.guardian_phone
        ?.replace(
          /\D/g,
          "",
        ) ??
      "";

    const whatsappUrl =
      phoneDigits
        ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(
            shareText,
          )}`
        : null;

    const emailDelivery =
      await sendGuardianInviteEmail({
        email:
          relation.guardian_email,
        guardianName:
          relation.guardian_name,
        schoolName:
          access.school.name,
        schoolId:
          access.school.id,
        studentName:
          relation.student_name,
        inviteUrl:
          oneTimeUrl,
        origin:
          request.nextUrl.origin,
        expiresAt:
          created.expires_at,
      });

    if (
      emailDelivery ===
        "FAILED" ||
      emailDelivery ===
        "NOT_CONFIGURED"
    ) {
      await emitCasaOperationalNotificationBestEffort({
        event:
          emailDelivery ===
            "NOT_CONFIGURED"
            ? "GUARDIAN_EMAIL_NOT_CONFIGURED"
            : "GUARDIAN_EMAIL_INVITE_FAILED",
        scope: {
          kind:
            "SCHOOL",
          schoolId:
            access.school.id,
          branchId:
            relation.home_branch_id,
        },
        title:
          emailDelivery ===
            "NOT_CONFIGURED"
            ? "Guardian email delivery is not configured"
            : "Guardian invitation email failed",
        body:
          emailDelivery ===
            "NOT_CONFIGURED"
            ? "CASA could not send a guardian setup email because Gmail delivery is not configured."
            : "CASA created the guardian setup link, but Gmail could not deliver the invitation email.",
        actionUrl:
          "/internal/notifications",
        dedupKey:
          `guardian-email:${access.school.id}:${emailDelivery}`,
        payload: {
          studentId,
          guardianId:
            relation.guardian_id,
          delivery:
            emailDelivery,
        },
      });
    }

    return NextResponse.json(
      {
        oneTimeUrl,
        expiresAt:
          created.expires_at,
        shareText,
        whatsappUrl,
        emailDelivery,
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
