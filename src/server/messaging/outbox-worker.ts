import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  SimhostngProviderError,
  renderAttendanceSms,
  sendSimhostngSms,
  smsRetryDelaySeconds,
  type SmsNotificationEventType,
} from "@/server/messaging/simhostng-provider";

const SIMHOSTNG_CONNECTION_REF =
  "SIMHOSTNG_DEFAULT";

interface ClaimedRow {
  id: string;
  school_id: string;
  event_type:
    SmsNotificationEventType;
  recipient_phone:
    string;
  payload:
    unknown;
  attempt_count:
    number;
  school_display_name:
    string;
  school_note:
    string | null;
  school_timezone:
    string;
}

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

function safeLimit(
  value:
    number |
    undefined,
) {
  return Math.max(
    1,
    Math.min(
      50,
      Math.trunc(
        value ?? 25,
      ),
    ),
  );
}

function maxAttempts() {
  const parsed =
    Number.parseInt(
      process.env
        .CASA_SMS_MAX_ATTEMPTS ??
        "6",
      10,
    );

  return Number.isFinite(
    parsed,
  )
    ? Math.max(
        1,
        Math.min(
          20,
          parsed,
        ),
      )
    : 6;
}

function errorInfo(
  cause: unknown,
) {
  if (
    cause instanceof
    SimhostngProviderError
  ) {
    return {
      code:
        cause.code.slice(
          0,
          80,
        ),
      message:
        cause.message.slice(
          0,
          500,
        ),
      transient:
        cause.transient,
    };
  }

  return {
    code:
      "SMS_DELIVERY_UNEXPECTED",
    message:
      (
        cause instanceof
        Error
          ? cause.message
          : "Unexpected SMS delivery failure."
      ).slice(
        0,
        500,
      ),
    transient:
      true,
  };
}

async function claimRows(
  input: {
    schoolId?:
      string;
    limit:
      number;
  },
) {
  const db =
    getDb();
  const schoolFilter =
    input.schoolId
      ? sql`and outbox.school_id = ${input.schoolId}::uuid`
      : sql``;

  const result =
    await db.execute(
      sql`
        with stale as (
          update school_notification_outbox outbox
          set
            status = 'RETRY'::school_notification_delivery_status,
            locked_at = null,
            available_at = now(),
            last_error_code = coalesce(
              outbox.last_error_code,
              'STALE_PROCESSING_RECOVERED'
            ),
            last_error_message = coalesce(
              outbox.last_error_message,
              'A stale SMS delivery lease was recovered.'
            ),
            updated_at = now()
          where outbox.status =
            'PROCESSING'::school_notification_delivery_status
            and outbox.provider_message_id is null
            and outbox.locked_at <
              now() - interval '10 minutes'
            ${schoolFilter}
            and exists (
              select 1
              from school_whatsapp_senders sender
              where sender.school_id =
                outbox.school_id
                and sender.id =
                  outbox.sender_id
                and sender.provider_connection_ref =
                  ${SIMHOSTNG_CONNECTION_REF}
            )
          returning outbox.id
        ),
        candidates as (
          select outbox.id
          from school_notification_outbox outbox
          join school_whatsapp_senders sender
            on sender.school_id =
              outbox.school_id
           and sender.id =
              outbox.sender_id
           and sender.status =
              'ACTIVE'::school_messaging_sender_status
           and sender.provider_connection_ref =
              ${SIMHOSTNG_CONNECTION_REF}
          where outbox.status in (
              'PENDING'::school_notification_delivery_status,
              'RETRY'::school_notification_delivery_status
            )
            and outbox.available_at <=
              now()
            ${schoolFilter}
          order by
            outbox.available_at,
            outbox.created_at,
            outbox.id
          for update of outbox
            skip locked
          limit ${input.limit}
        ),
        claimed as (
          update school_notification_outbox outbox
          set
            status =
              'PROCESSING'::school_notification_delivery_status,
            attempt_count =
              outbox.attempt_count +
              1,
            locked_at =
              now(),
            updated_at =
              now()
          from candidates
          where outbox.id =
            candidates.id
          returning
            outbox.id,
            outbox.school_id,
            outbox.sender_id,
            outbox.event_type::text
              as event_type,
            outbox.recipient_phone,
            outbox.payload,
            outbox.attempt_count
        )
        select
          claimed.id,
          claimed.school_id,
          claimed.event_type,
          claimed.recipient_phone,
          claimed.payload,
          claimed.attempt_count,
          coalesce(
            nullif(
              trim(
                sender.verified_name
              ),
              ''
            ),
            school.name
          ) as school_display_name,
          case
            when sender.provider_business_account_id =
              '__NONE__'
              then null
            else
              sender.provider_business_account_id
          end as school_note,
          school.timezone
            as school_timezone
        from claimed
        join school_whatsapp_senders sender
          on sender.school_id =
            claimed.school_id
         and sender.id =
            claimed.sender_id
         and sender.status =
            'ACTIVE'::school_messaging_sender_status
         and sender.provider_connection_ref =
            ${SIMHOSTNG_CONNECTION_REF}
        join schools school
          on school.id =
            claimed.school_id
      `,
    );

  return rowsOf<
    ClaimedRow
  >(
    result,
  );
}

export interface SmsOutboxRunResult {
  claimed:
    number;
  sent:
    number;
  retried:
    number;
  failed:
    number;
  errors:
    Array<{
      id:
        string;
      code:
        string;
    }>;
}

export async function runSmsOutbox(
  input: {
    schoolId?:
      string;
    limit?:
      number;
  } = {},
): Promise<
  SmsOutboxRunResult
> {
  const db =
    getDb();
  const rows =
    await claimRows({
      schoolId:
        input.schoolId,
      limit:
        safeLimit(
          input.limit,
        ),
    });

  const result:
    SmsOutboxRunResult = {
      claimed:
        rows.length,
      sent:
        0,
      retried:
        0,
      failed:
        0,
      errors:
        [],
    };

  for (
    const row of
      rows
  ) {
    try {
      const message =
        renderAttendanceSms({
          eventType:
            row.event_type,
          payload:
            row.payload,
          schoolName:
            row.school_display_name,
          note:
            row.school_note,
          timeZone:
            row.school_timezone,
        });

      const delivered =
        await sendSimhostngSms({
          recipientPhone:
            row.recipient_phone,
          message,
          reference:
            row.id,
        });

      await db.execute(
        sql`
          update school_notification_outbox
          set
            status =
              'SENT'::school_notification_delivery_status,
            provider_message_id =
              ${delivered.messageId},
            sent_at =
              now(),
            locked_at =
              null,
            last_error_code =
              null,
            last_error_message =
              null,
            updated_at =
              now()
          where id =
            ${row.id}::uuid
            and status =
              'PROCESSING'::school_notification_delivery_status
        `,
      );

      result.sent +=
        1;
    } catch (
      cause
    ) {
      const failure =
        errorInfo(
          cause,
        );
      const retry =
        failure.transient &&
        row.attempt_count <
          maxAttempts();
      const delaySeconds =
        smsRetryDelaySeconds(
          row.attempt_count,
        );

      if (retry) {
        await db.execute(
          sql`
            update school_notification_outbox
            set
              status =
                'RETRY'::school_notification_delivery_status,
              available_at =
                now() +
                (
                  ${delaySeconds}::int *
                  interval '1 second'
                ),
              locked_at =
                null,
              last_error_code =
                ${failure.code},
              last_error_message =
                ${failure.message},
              updated_at =
                now()
            where id =
              ${row.id}::uuid
              and status =
                'PROCESSING'::school_notification_delivery_status
          `,
        );
        result.retried +=
          1;
      } else {
        await db.execute(
          sql`
            update school_notification_outbox
            set
              status =
                'FAILED'::school_notification_delivery_status,
              locked_at =
                null,
              last_error_code =
                ${failure.code},
              last_error_message =
                ${failure.message},
              updated_at =
                now()
            where id =
              ${row.id}::uuid
              and status =
                'PROCESSING'::school_notification_delivery_status
          `,
        );
        result.failed +=
          1;
      }

      result.errors.push({
        id:
          row.id,
        code:
          failure.code,
      });
    }
  }

  return result;
}
