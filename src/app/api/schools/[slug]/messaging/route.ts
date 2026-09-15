import {
  randomUUID,
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
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";
import {
  getSimhostngProviderReadiness,
} from "@/server/messaging/simhostng-provider";

export const dynamic =
  "force-dynamic";

const SIMHOSTNG_CONNECTION_REF =
  "SIMHOSTNG_DEFAULT";
const EMPTY_NOTE_SENTINEL =
  "__NONE__";

interface RouteContext {
  params:
    Promise<{
      slug:
        string;
    }>;
}

const saveSettingsSchema =
  z.object({
    action:
      z.literal(
        "SAVE_SMS_SETTINGS",
      ),
    displayName:
      z.string()
        .trim()
        .min(
          1,
        )
        .max(
          40,
        ),
    note:
      z.string()
        .trim()
        .max(
          40,
        ),
  });

const disableSchema =
  z.object({
    action:
      z.literal(
        "DISABLE_SMS",
      ),
  });

const retrySchema =
  z.object({
    action:
      z.literal(
        "RETRY_FAILED",
      ),
    outboxId:
      z.string()
        .uuid(),
  });

const bodySchema =
  z.discriminatedUnion(
    "action",
    [
      saveSettingsSchema,
      disableSchema,
      retrySchema,
    ],
  );

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

function maskPhone(
  value: string,
) {
  const clean =
    value.replace(
      /\s+/g,
      "",
    );

  if (
    clean.length <=
    4
  ) {
    return "****";
  }

  return `${"*".repeat(
    Math.min(
      7,
      clean.length -
        4,
    ),
  )}${clean.slice(
    -4,
  )}`;
}

async function accessFor(
  slug: string,
) {
  return requireSchoolRole(
    slug,
    [
      "OWNER",
      "ADMIN",
    ],
  );
}

function authResponse(
  error: unknown,
) {
  if (
    error instanceof
    AuthRequiredError
  ) {
    return NextResponse.json(
      {
        message:
          "Sign in is required.",
      },
      {
        status:
          401,
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
          "Owner or Admin access is required.",
      },
      {
        status:
          403,
      },
    );
  }

  return null;
}

export async function GET(
  _request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const access =
      await accessFor(
        slug,
      );
    const db =
      getDb();

    const [
      senderResult,
      statusResult,
      recentResult,
      guardianExceptionsResult,
    ] =
      await Promise.all([
        db.execute(
          sql`
            select
              id,
              display_phone_number,
              verified_name,
              provider_business_account_id,
              provider_phone_number_id,
              provider_connection_ref,
              status::text
                as status,
              activated_at,
              revoked_at,
              created_at,
              updated_at
            from school_whatsapp_senders
            where school_id =
              ${access.school.id}::uuid
              and provider_connection_ref =
                ${SIMHOSTNG_CONNECTION_REF}
            order by
              case status
                when 'ACTIVE'::school_messaging_sender_status
                  then 0
                when 'PENDING_SETUP'::school_messaging_sender_status
                  then 1
                when 'SUSPENDED'::school_messaging_sender_status
                  then 2
                else 3
              end,
              created_at desc
            limit 1
          `,
        ),
        db.execute(
          sql`
            select
              outbox.status::text
                as status,
              count(*)::int
                as count
            from school_notification_outbox outbox
            join school_whatsapp_senders sender
              on sender.school_id =
                outbox.school_id
             and sender.id =
                outbox.sender_id
             and sender.provider_connection_ref =
                ${SIMHOSTNG_CONNECTION_REF}
            where outbox.school_id =
              ${access.school.id}::uuid
            group by
              outbox.status
          `,
        ),
        db.execute(
          sql`
            select
              outbox.id,
              outbox.event_type::text
                as event_type,
              outbox.recipient_phone,
              outbox.template_key,
              outbox.status::text
                as status,
              outbox.attempt_count,
              outbox.available_at,
              outbox.sent_at,
              outbox.provider_message_id,
              outbox.last_error_code,
              outbox.last_error_message,
              outbox.created_at
            from school_notification_outbox outbox
            join school_whatsapp_senders sender
              on sender.school_id =
                outbox.school_id
             and sender.id =
                outbox.sender_id
             and sender.provider_connection_ref =
                ${SIMHOSTNG_CONNECTION_REF}
            where outbox.school_id =
              ${access.school.id}::uuid
            order by
              outbox.created_at
                desc
            limit 40
          `,
        ),
        db.execute(
          sql`
            select
              count(*)::int
                as count
            from student_guardians mapping
            join guardians guardian
              on guardian.school_id =
                mapping.school_id
             and guardian.id =
                mapping.guardian_id
            where mapping.school_id =
              ${access.school.id}::uuid
              and mapping.receives_notifications =
                true
              and guardian.status =
                'ACTIVE'::guardian_status
              and (
                guardian.phone
                  is null
                or length(
                  trim(
                    guardian.phone
                  )
                ) =
                  0
              )
          `,
        ),
      ]);

    const statusCounts:
      Record<
        string,
        number
      > = {};

    for (
      const row of
        rowsOf<{
          status:
            string;
          count:
            number;
        }>(
          statusResult,
        )
    ) {
      statusCounts[
        row.status
      ] =
        Number(
          row.count ??
            0,
        );
    }

    const recent =
      rowsOf<{
        id:
          string;
        event_type:
          string;
        recipient_phone:
          string;
        template_key:
          string;
        status:
          string;
        attempt_count:
          number;
        available_at:
          string;
        sent_at:
          string |
          null;
        provider_message_id:
          string |
          null;
        last_error_code:
          string |
          null;
        last_error_message:
          string |
          null;
        created_at:
          string;
      }>(
        recentResult,
      ).map(
        (
          row,
        ) => ({
          ...row,
          recipient_phone:
            maskPhone(
              row.recipient_phone,
            ),
          provider_message_id:
            row.provider_message_id
              ? `${row.provider_message_id.slice(
                  0,
                  16,
                )}...`
              : null,
        }),
      );

    const sender =
      rowsOf<{
        id:
          string;
        display_phone_number:
          string;
        verified_name:
          string |
          null;
        provider_business_account_id:
          string |
          null;
        provider_phone_number_id:
          string |
          null;
        provider_connection_ref:
          string |
          null;
        status:
          string;
        activated_at:
          string |
          null;
        revoked_at:
          string |
          null;
        created_at:
          string;
        updated_at:
          string;
      }>(
        senderResult,
      )[0] ??
      null;

    return NextResponse.json(
      {
        school: {
          id:
            access.school.id,
          name:
            access.school.name,
        },
        provider:
          getSimhostngProviderReadiness(),
        settings: {
          displayName:
            sender
              ?.verified_name ??
            access.school.name,
          note:
            sender
              ?.provider_business_account_id ===
            EMPTY_NOTE_SENTINEL
              ? ""
              : sender
                  ?.provider_business_account_id ??
                "",
          enabled:
            sender
              ?.status ===
            "ACTIVE",
          activatedAt:
            sender
              ?.activated_at ??
            null,
        },
        sender,
        delivery: {
          counts:
            statusCounts,
          guardianDestinationsMissing:
            Number(
              rowsOf<{
                count:
                  number;
              }>(
                guardianExceptionsResult,
              )[0]
                ?.count ??
                0,
            ),
          recent,
        },
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (
    error
  ) {
    const response =
      authResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}

export async function POST(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    const access =
      await accessFor(
        slug,
      );
    const parsed =
      bodySchema.safeParse(
        await request
          .json()
          .catch(
            () => ({}),
          ),
      );

    if (
      !parsed.success
    ) {
      return NextResponse.json(
        {
          message:
            "Invalid SMS messaging action.",
          issues:
            parsed.error.flatten(),
        },
        {
          status:
            400,
        },
      );
    }

    const db =
      getDb();
    const input =
      parsed.data;

    if (
      input.action ===
      "SAVE_SMS_SETTINGS"
    ) {
      const readiness =
        getSimhostngProviderReadiness();

      if (
        !readiness.ready
      ) {
        return NextResponse.json(
          {
            message:
              "SimHostNG SMS runtime configuration is incomplete. Configure the server-side provider before enabling school SMS.",
            provider:
              readiness,
          },
          {
            status:
              503,
          },
        );
      }

      const providerPhoneNumberId =
        `SIMHOSTNG-${access.school.id}`;
      const note =
        input.note ||
        EMPTY_NOTE_SENTINEL;

      const existingResult =
        await db.execute(
          sql`
            select id
            from school_whatsapp_senders
            where school_id =
              ${access.school.id}::uuid
              and provider_connection_ref =
                ${SIMHOSTNG_CONNECTION_REF}
            order by
              created_at desc
            limit 1
          `,
        );
      const existing =
        rowsOf<{
          id:
            string;
        }>(
          existingResult,
        )[0];
      const senderId =
        existing?.id ??
        randomUUID();

      await db.execute(
        sql`
          with deactivated as (
            update school_whatsapp_senders
            set
              status =
                'SUSPENDED'::school_messaging_sender_status,
              updated_at =
                now()
            where school_id =
              ${access.school.id}::uuid
              and id <>
                ${senderId}::uuid
              and status =
                'ACTIVE'::school_messaging_sender_status
            returning id
          ),
          cancelled as (
            update school_notification_outbox outbox
            set
              status =
                'CANCELLED'::school_notification_delivery_status,
              locked_at =
                null,
              last_error_code =
                'DELIVERY_CHANNEL_REPLACED',
              last_error_message =
                'The school changed its active guardian-notification channel before this message was delivered.',
              updated_at =
                now()
            where outbox.sender_id in (
              select id
              from deactivated
            )
              and outbox.status in (
                'PENDING'::school_notification_delivery_status,
                'RETRY'::school_notification_delivery_status
              )
            returning
              outbox.id
          )
          select
            count(*)::int
              as cancelled
          from cancelled
        `,
      );

      if (existing) {
        await db.execute(
          sql`
            update school_whatsapp_senders
            set
              display_phone_number =
                'SimHostNG SMS',
              verified_name =
                ${input.displayName},
              provider_business_account_id =
                ${note},
              provider_phone_number_id =
                ${providerPhoneNumberId},
              provider_connection_ref =
                ${SIMHOSTNG_CONNECTION_REF},
              status =
                'ACTIVE'::school_messaging_sender_status,
              activated_at =
                now(),
              revoked_at =
                null,
              updated_at =
                now()
            where school_id =
              ${access.school.id}::uuid
              and id =
                ${senderId}::uuid
          `,
        );
      } else {
        await db.execute(
          sql`
            insert into school_whatsapp_senders (
              id,
              school_id,
              display_phone_number,
              verified_name,
              provider_business_account_id,
              provider_phone_number_id,
              provider_connection_ref,
              status,
              created_by_membership_id,
              activated_at,
              created_at,
              updated_at
            ) values (
              ${senderId}::uuid,
              ${access.school.id}::uuid,
              'SimHostNG SMS',
              ${input.displayName},
              ${note},
              ${providerPhoneNumberId},
              ${SIMHOSTNG_CONNECTION_REF},
              'ACTIVE'::school_messaging_sender_status,
              ${access.membership.id}::uuid,
              now(),
              now(),
              now()
            )
          `,
        );
      }

      return NextResponse.json({
        ok:
          true,
        settings: {
          displayName:
            input.displayName,
          note:
            input.note,
          enabled:
            true,
        },
      });
    }

    if (
      input.action ===
      "DISABLE_SMS"
    ) {
      const changed =
        await db.execute(
          sql`
            with changed_sender as (
              update school_whatsapp_senders
              set
                status =
                  'SUSPENDED'::school_messaging_sender_status,
                updated_at =
                  now()
              where school_id =
                ${access.school.id}::uuid
                and provider_connection_ref =
                  ${SIMHOSTNG_CONNECTION_REF}
                and status <>
                  'REVOKED'::school_messaging_sender_status
              returning id
            ),
            cancelled as (
              update school_notification_outbox outbox
              set
                status =
                  'CANCELLED'::school_notification_delivery_status,
                locked_at =
                  null,
                last_error_code =
                  'SMS_DISABLED',
                last_error_message =
                  'The school disabled guardian SMS before this notification was delivered.',
                updated_at =
                  now()
              where outbox.sender_id in (
                select id
                from changed_sender
              )
                and outbox.status in (
                  'PENDING'::school_notification_delivery_status,
                  'RETRY'::school_notification_delivery_status
                )
              returning
                outbox.id
            )
            select
              id
            from changed_sender
          `,
        );

      return NextResponse.json({
        ok:
          true,
        disabled:
          rowsOf(
            changed,
          ).length >
          0,
      });
    }

    const retried =
      await db.execute(
        sql`
          update school_notification_outbox outbox
          set
            status =
              'RETRY'::school_notification_delivery_status,
            available_at =
              now(),
            locked_at =
              null,
            last_error_code =
              null,
            last_error_message =
              null,
            updated_at =
              now()
          from school_whatsapp_senders sender
          where outbox.id =
            ${input.outboxId}::uuid
            and outbox.school_id =
              ${access.school.id}::uuid
            and outbox.status =
              'FAILED'::school_notification_delivery_status
            and sender.school_id =
              outbox.school_id
            and sender.id =
              outbox.sender_id
            and sender.status =
              'ACTIVE'::school_messaging_sender_status
            and sender.provider_connection_ref =
              ${SIMHOSTNG_CONNECTION_REF}
          returning
            outbox.id
        `,
      );

    if (
      rowsOf(
        retried,
      ).length !==
      1
    ) {
      return NextResponse.json(
        {
          message:
            "Failed SMS notification cannot be retried with the current SMS configuration.",
        },
        {
          status:
            409,
        },
      );
    }

    return NextResponse.json({
      ok:
        true,
      status:
        "RETRY",
    });
  } catch (
    error
  ) {
    const response =
      authResponse(
        error,
      );

    if (response) {
      return response;
    }

    const message =
      error instanceof
      Error
        ? error.message
        : "SMS messaging action failed.";

    return NextResponse.json(
      {
        message,
      },
      {
        status:
          502,
      },
    );
  }
}
