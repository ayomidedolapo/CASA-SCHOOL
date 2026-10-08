import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { sendFinancePaymentReminderEmail } from "@/server/messaging/finance-email";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

type ReminderRow = {
  id: string;
  invoice_id: string;
  school_id: string;
  reminder_kind: "UPCOMING_DUE" | "OVERDUE";
  recipient_email: string;
  attempt_count: number;
  invoice_number: string;
  school_name: string;
  due_on: string;
  total_kobo: string | number;
  balance_kobo: string | number;
  days_overdue: number;
};

async function reconcileFinancePaymentReminders() {
  const db = getDb();

  const result = await db.execute(sql`
    with invoice_state as (
      select
        i.id,
        i.school_id,
        i.invoice_number,
        i.bill_to_email,
        i.due_on,
        greatest(
          i.total_kobo - coalesce(paid.paid_kobo, 0),
          0
        )::bigint as balance_kobo,
        coalesce(policy.is_enabled, true) as reminders_enabled,
        coalesce(policy.before_due_days, 3)::int as before_due_days,
        coalesce(policy.overdue_every_days, 3)::int as overdue_every_days,
        coalesce(policy.max_overdue_reminders, 5)::int as max_overdue_reminders,
        (
          select count(*)::int
          from casa_finance_payment_reminders existing
          where existing.invoice_id = i.id
            and existing.reminder_kind = 'OVERDUE'
            and existing.status = 'SENT'
        ) as overdue_sent_count
      from casa_finance_invoices i
      left join casa_finance_reminder_policies policy
        on policy.school_id = i.school_id
      left join lateral (
        select coalesce(sum(p.amount_kobo), 0)::bigint as paid_kobo
        from casa_finance_payments p
        where p.invoice_id = i.id
      ) paid on true
      where i.status not in ('DRAFT','PAID','VOID')
        and i.due_on is not null
        and i.bill_to_email is not null
    ),
    candidates as (
      select
        state.id as invoice_id,
        state.school_id,
        case
          when state.due_on = current_date + state.before_due_days
            then 'UPCOMING_DUE'
          else 'OVERDUE'
        end as reminder_kind,
        current_date as scheduled_for,
        state.bill_to_email as recipient_email
      from invoice_state state
      where state.reminders_enabled = true
        and state.balance_kobo > 0
        and (
          state.due_on = current_date + state.before_due_days
          or (
            state.due_on < current_date
            and state.overdue_sent_count < state.max_overdue_reminders
            and mod(
              (current_date - state.due_on),
              state.overdue_every_days
            ) = 0
          )
        )
    )
    insert into casa_finance_payment_reminders (
      id,
      invoice_id,
      school_id,
      reminder_kind,
      scheduled_for,
      recipient_email,
      status,
      next_attempt_at
    )
    select
      gen_random_uuid(),
      candidate.invoice_id,
      candidate.school_id,
      candidate.reminder_kind,
      candidate.scheduled_for,
      candidate.recipient_email,
      'PENDING',
      now()
    from candidates candidate
    on conflict (
      invoice_id,
      reminder_kind,
      scheduled_for
    ) do nothing
    returning id
  `);

  return rowsOf(result).length;
}

export async function runFinancePaymentReminderWorker(
  input: { limit?: number } = {},
) {
  const db = getDb();
  const limit = Math.min(10, Math.max(1, input.limit ?? 5));

  const reconciled = await reconcileFinancePaymentReminders();

  await db.execute(sql`
    update casa_finance_payment_reminders
    set
      status = 'RETRY',
      next_attempt_at = now(),
      last_error = coalesce(
        last_error,
        'Recovered stale Finance reminder claim.'
      ),
      updated_at = now()
    where status = 'PROCESSING'
      and updated_at < now() - interval '10 minutes'
  `);

  const claimed = rowsOf<ReminderRow>(
    await db.execute(sql`
      with due as (
        select reminder.id
        from casa_finance_payment_reminders reminder
        join casa_finance_invoices invoice
          on invoice.id = reminder.invoice_id
        left join lateral (
          select coalesce(sum(payment.amount_kobo), 0)::bigint as paid_kobo
          from casa_finance_payments payment
          where payment.invoice_id = invoice.id
        ) paid on true
        where reminder.status in ('PENDING','RETRY')
          and reminder.next_attempt_at <= now()
          and invoice.status not in ('DRAFT','PAID','VOID')
          and greatest(
            invoice.total_kobo - coalesce(paid.paid_kobo, 0),
            0
          ) > 0
        order by reminder.scheduled_for, reminder.created_at
        limit ${limit}
        for update of reminder skip locked
      )
      update casa_finance_payment_reminders reminder
      set
        status = 'PROCESSING',
        attempt_count = reminder.attempt_count + 1,
        updated_at = now()
      from due
      where reminder.id = due.id
      returning
        reminder.id::text,
        reminder.invoice_id::text,
        reminder.school_id::text,
        reminder.reminder_kind,
        reminder.recipient_email,
        reminder.attempt_count,
        (
          select invoice_number
          from casa_finance_invoices
          where id = reminder.invoice_id
        ) as invoice_number,
        (
          select school.name
          from schools school
          where school.id = reminder.school_id
        ) as school_name,
        (
          select due_on::text
          from casa_finance_invoices
          where id = reminder.invoice_id
        ) as due_on,
        (
          select total_kobo
          from casa_finance_invoices
          where id = reminder.invoice_id
        ) as total_kobo,
        (
          select greatest(
            invoice.total_kobo - coalesce(
              (
                select sum(payment.amount_kobo)
                from casa_finance_payments payment
                where payment.invoice_id = invoice.id
              ),
              0
            ),
            0
          )::bigint
          from casa_finance_invoices invoice
          where invoice.id = reminder.invoice_id
        ) as balance_kobo,
        greatest(
          current_date - (
            select invoice.due_on
            from casa_finance_invoices invoice
            where invoice.id = reminder.invoice_id
          ),
          0
        )::int as days_overdue
    `),
  );

  let sent = 0;
  let retried = 0;
  let failed = 0;

  for (const reminder of claimed) {
    const result = await sendFinancePaymentReminderEmail({
      to: reminder.recipient_email,
      schoolName: reminder.school_name,
      invoiceNumber: reminder.invoice_number,
      reminderKind: reminder.reminder_kind,
      dueOn: reminder.due_on,
      totalKobo: Number(reminder.total_kobo),
      balanceKobo: Number(reminder.balance_kobo),
      daysOverdue: Number(reminder.days_overdue),
    });

    if (result.ok) {
      sent += 1;

      await db.execute(sql`
        update casa_finance_payment_reminders
        set
          status = 'SENT',
          provider_message_id = ${result.messageId},
          sent_at = now(),
          last_error = null,
          updated_at = now()
        where id = ${reminder.id}::uuid
          and status = 'PROCESSING'
      `);

      await db.execute(sql`
        insert into casa_finance_email_deliveries (
          id,
          school_id,
          invoice_id,
          delivery_kind,
          recipient_email,
          provider_message_id,
          status,
          sent_at
        )
        values (
          ${randomUUID()}::uuid,
          ${reminder.school_id}::uuid,
          ${reminder.invoice_id}::uuid,
          'PAYMENT_REMINDER',
          ${reminder.recipient_email},
          ${result.messageId},
          'SENT',
          now()
        )
      `);

      continue;
    }

    const retryable = result.configured && reminder.attempt_count < 3;
    const nextAttempt = new Date(
      Date.now() + Math.pow(2, Math.max(0, reminder.attempt_count - 1)) * 15 * 60_000,
    ).toISOString();

    if (retryable) {
      retried += 1;

      await db.execute(sql`
        update casa_finance_payment_reminders
        set
          status = 'RETRY',
          next_attempt_at = ${nextAttempt}::timestamptz,
          last_error = ${result.code},
          updated_at = now()
        where id = ${reminder.id}::uuid
      `);
    } else {
      failed += 1;

      await db.execute(sql`
        update casa_finance_payment_reminders
        set
          status = 'FAILED',
          last_error = ${result.code},
          updated_at = now()
        where id = ${reminder.id}::uuid
      `);
    }

    await db.execute(sql`
      insert into casa_finance_email_deliveries (
        id,
        school_id,
        invoice_id,
        delivery_kind,
        recipient_email,
        status,
        error_code
      )
      values (
        ${randomUUID()}::uuid,
        ${reminder.school_id}::uuid,
        ${reminder.invoice_id}::uuid,
        'PAYMENT_REMINDER',
        ${reminder.recipient_email},
        ${result.configured ? "FAILED" : "NOT_CONFIGURED"},
        ${result.code}
      )
    `);
  }

  return {
    reconciled,
    claimed: claimed.length,
    sent,
    retried,
    failed,
  };
}
