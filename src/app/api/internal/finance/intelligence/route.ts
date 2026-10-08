import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDatabaseUrl } from "@/config/env";
import { getDb } from "@/db";
import { requireCasaSuperAdmin } from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";
import { runFinancePaymentReminderWorker } from "@/server/messaging/finance-reminder-worker";

export const dynamic = "force-dynamic";

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

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monthString = z.string().regex(/^\d{4}-\d{2}$/);
const kobo = (value: number) => Math.round(value * 100);

const budgetLineSchema = z.object({
  category: z.string().trim().min(2).max(80),
  plannedNaira: z.number().min(0).max(1000000000),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE_BUDGET"),
    schoolId: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(2).max(200),
    periodKind: z.enum(["MONTHLY", "QUARTERLY", "ANNUAL", "CUSTOM"]),
    startsOn: dateString,
    endsOn: dateString,
    notes: z.string().trim().max(3000).nullable().optional(),
    lines: z.array(budgetLineSchema).min(1).max(30),
  }),
  z.object({
    action: z.literal("SET_REMINDER_POLICY"),
    schoolId: z.string().uuid(),
    isEnabled: z.boolean(),
    beforeDueDays: z.number().int().min(0).max(30),
    overdueEveryDays: z.number().int().min(1).max(30),
    maxOverdueReminders: z.number().int().min(1).max(20),
  }),
  z.object({
    action: z.literal("CREATE_CALENDAR_EVENT"),
    schoolId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(2).max(200),
    eventType: z.enum([
      "BUDGET_REVIEW",
      "EXPECTED_PAYMENT",
      "EXPENSE_DUE",
      "TAX",
      "OTHER",
    ]),
    eventDate: dateString,
    amountNaira: z.number().min(0).max(1000000000).nullable().optional(),
    description: z.string().trim().min(2).max(4000),
    speechText: z.string().trim().max(320).nullable().optional(),
  }),
  z.object({
    action: z.literal("SET_CALENDAR_EVENT_STATUS"),
    eventId: z.string().uuid(),
    status: z.enum(["PLANNED", "COMPLETED", "CANCELLED"]),
  }),
  z.object({
    action: z.literal("RUN_REMINDER_SCAN"),
  }),
]);

function monthBounds(month: string) {
  const parsed = monthString.safeParse(month);
  if (!parsed.success) {
    const now = new Date();
    const current = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    return monthBounds(current);
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(year, monthNumber, 1));
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);

  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    await requireCasaSuperAdmin();
    const db = getDb();
    const month =
      request.nextUrl.searchParams.get("month") ??
      new Date().toISOString().slice(0, 7);
    const bounds = monthBounds(month);

    const [schools, budgets, budgetLines, unbudgetedCategories, policies, reminders, manualCalendar, invoiceCalendar, recurringCalendar, budgetCalendar] =
      await Promise.all([
        db.execute(sql`
          select id,name,slug
          from schools
          where status='ACTIVE'::school_status
          order by name
        `),
        db.execute(sql`
          select
            b.id,b.school_id,s.name as school_name,b.name,b.period_kind,
            b.starts_on::text as starts_on,b.ends_on::text as ends_on,b.status,b.notes,
            coalesce(lines.planned_kobo,0)::bigint as planned_kobo,
            coalesce(budgeted.actual_kobo,0)::bigint as budgeted_actual_kobo,
            coalesce(unbudgeted.actual_kobo,0)::bigint as unbudgeted_actual_kobo,
            (coalesce(budgeted.actual_kobo,0)+coalesce(unbudgeted.actual_kobo,0))::bigint as total_actual_kobo
          from casa_finance_budgets b
          left join schools s on s.id=b.school_id
          left join lateral (
            select coalesce(sum(line.planned_kobo),0)::bigint as planned_kobo
            from casa_finance_budget_lines line
            where line.budget_id=b.id
          ) lines on true
          left join lateral (
            select coalesce(sum(expense.amount_kobo),0)::bigint as actual_kobo
            from casa_finance_expenses expense
            where expense.incurred_on between b.starts_on and b.ends_on
              and (b.school_id is null or expense.school_id=b.school_id)
              and exists (
                select 1
                from casa_finance_budget_lines line
                where line.budget_id=b.id
                  and lower(trim(expense.category))=lower(trim(line.category))
              )
          ) budgeted on true
          left join lateral (
            select coalesce(sum(expense.amount_kobo),0)::bigint as actual_kobo
            from casa_finance_expenses expense
            where expense.incurred_on between b.starts_on and b.ends_on
              and (b.school_id is null or expense.school_id=b.school_id)
              and not exists (
                select 1
                from casa_finance_budget_lines line
                where line.budget_id=b.id
                  and lower(trim(expense.category))=lower(trim(line.category))
              )
          ) unbudgeted on true
          order by b.starts_on desc,b.created_at desc
          limit 100
        `),
        db.execute(sql`
          select
            line.id,line.budget_id,line.category,line.planned_kobo,line.notes,
            coalesce(actual.actual_kobo,0)::bigint as actual_kobo
          from casa_finance_budget_lines line
          join casa_finance_budgets budget on budget.id=line.budget_id
          left join lateral (
            select coalesce(sum(expense.amount_kobo),0)::bigint as actual_kobo
            from casa_finance_expenses expense
            where expense.incurred_on between budget.starts_on and budget.ends_on
              and (budget.school_id is null or expense.school_id=budget.school_id)
              and lower(trim(expense.category))=lower(trim(line.category))
          ) actual on true
          order by line.created_at
        `),
        db.execute(sql`
          select
            budget.id as budget_id,
            initcap(lower(trim(expense.category))) as category,
            coalesce(sum(expense.amount_kobo),0)::bigint as actual_kobo
          from casa_finance_budgets budget
          join casa_finance_expenses expense
            on expense.incurred_on between budget.starts_on and budget.ends_on
           and (budget.school_id is null or expense.school_id=budget.school_id)
          where not exists (
            select 1
            from casa_finance_budget_lines line
            where line.budget_id=budget.id
              and lower(trim(expense.category))=lower(trim(line.category))
          )
          group by budget.id,lower(trim(expense.category))
          order by budget.id,actual_kobo desc
          limit 1000
        `),
        db.execute(sql`
          select
            school.id as school_id,
            school.name as school_name,
            (policy.school_id is not null) as is_saved,
            coalesce(policy.is_enabled,true) as is_enabled,
            coalesce(policy.before_due_days,3)::int as before_due_days,
            coalesce(policy.overdue_every_days,3)::int as overdue_every_days,
            coalesce(policy.max_overdue_reminders,5)::int as max_overdue_reminders
          from schools school
          left join casa_finance_reminder_policies policy
            on policy.school_id=school.id
          where school.status='ACTIVE'::school_status
          order by school.name
        `),
        db.execute(sql`
          select
            reminder.id,
            reminder.invoice_id,
            reminder.school_id,
            school.name as school_name,
            invoice.invoice_number,
            reminder.reminder_kind,
            reminder.scheduled_for::text as scheduled_for,
            reminder.recipient_email,
            reminder.status,
            reminder.attempt_count,
            reminder.sent_at,
            reminder.last_error
          from casa_finance_payment_reminders reminder
          join schools school on school.id=reminder.school_id
          join casa_finance_invoices invoice on invoice.id=reminder.invoice_id
          order by reminder.created_at desc
          limit 100
        `),
        db.execute(sql`
          select
            event.id,
            'MANUAL'::text as source_kind,
            event.school_id,
            school.name as school_name,
            event.title,
            event.event_type,
            event.event_date::text as event_date,
            event.amount_kobo,
            event.description,
            coalesce(event.speech_text,event.title) as speech_text,
            event.status
          from casa_finance_calendar_events event
          left join schools school on school.id=event.school_id
          where event.event_date between ${bounds.start}::date and ${bounds.end}::date
            and event.status <> 'CANCELLED'
          order by event.event_date,event.created_at
        `),
        db.execute(sql`
          select
            invoice.id,
            'INVOICE_DUE'::text as source_kind,
            invoice.school_id,
            school.name as school_name,
            ('Invoice ' || invoice.invoice_number || ' due')::text as title,
            'EXPECTED_PAYMENT'::text as event_type,
            invoice.due_on::text as event_date,
            greatest(invoice.total_kobo-coalesce(paid.paid_kobo,0),0)::bigint as amount_kobo,
            ('Outstanding CASA invoice for ' || school.name)::text as description,
            ('Payment check: ' || invoice.invoice_number || ' is due today.')::text as speech_text,
            case when greatest(invoice.total_kobo-coalesce(paid.paid_kobo,0),0)=0 then 'COMPLETED' else 'PLANNED' end as status
          from casa_finance_invoices invoice
          join schools school on school.id=invoice.school_id
          left join lateral (
            select coalesce(sum(payment.amount_kobo),0)::bigint as paid_kobo
            from casa_finance_payments payment
            where payment.invoice_id=invoice.id
          ) paid on true
          where invoice.due_on between ${bounds.start}::date and ${bounds.end}::date
            and invoice.status not in ('DRAFT','VOID')
          order by invoice.due_on
        `),
        db.execute(sql`
          select
            recurring.id,
            'RECURRING_EXPENSE'::text as source_kind,
            recurring.school_id,
            school.name as school_name,
            recurring.name as title,
            'EXPENSE_DUE'::text as event_type,
            recurring.next_due_on::text as event_date,
            recurring.amount_kobo,
            (recurring.vendor || ' - ' || recurring.category)::text as description,
            ('Upcoming recurring cost: ' || recurring.name || '.')::text as speech_text,
            'PLANNED'::text as status
          from casa_finance_recurring_expenses recurring
          left join schools school on school.id=recurring.school_id
          where recurring.is_active=true
            and recurring.next_due_on between ${bounds.start}::date and ${bounds.end}::date
          order by recurring.next_due_on
        `),
        db.execute(sql`
          select
            budget.id,
            'BUDGET_END'::text as source_kind,
            budget.school_id,
            school.name as school_name,
            budget.name as title,
            'BUDGET_REVIEW'::text as event_type,
            budget.ends_on::text as event_date,
            coalesce(lines.planned_kobo,0)::bigint as amount_kobo,
            ('Budget period ends for ' || budget.name)::text as description,
            ('Budget review time: check ' || budget.name || ' against actual spending.')::text as speech_text,
            case when budget.status='CLOSED' then 'COMPLETED' else 'PLANNED' end as status
          from casa_finance_budgets budget
          left join schools school on school.id=budget.school_id
          left join lateral (
            select coalesce(sum(line.planned_kobo),0)::bigint as planned_kobo
            from casa_finance_budget_lines line
            where line.budget_id=budget.id
          ) lines on true
          where budget.ends_on between ${bounds.start}::date and ${bounds.end}::date
            and budget.status <> 'CLOSED'
          order by budget.ends_on
        `),
      ]);

    return NextResponse.json(
      {
        month,
        monthStart: bounds.start,
        monthEnd: bounds.end,
        schools: rowsOf(schools),
        budgets: rowsOf(budgets),
        budgetLines: rowsOf(budgetLines),
        unbudgetedCategories: rowsOf(unbudgetedCategories),
        reminderPolicies: rowsOf(policies),
        reminders: rowsOf(reminders),
        calendarEvents: [
          ...rowsOf(manualCalendar),
          ...rowsOf(invoiceCalendar),
          ...rowsOf(recurringCalendar),
          ...rowsOf(budgetCalendar),
        ],
      },
      { headers: casaInternalNoStoreHeaders },
    );
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;

    console.error("CASA Finance intelligence read failed", error);
    return NextResponse.json(
      { message: "CASA could not load Finance planning and automation." },
      { status: 500, headers: casaInternalNoStoreHeaders },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireCasaSuperAdmin();
    const parsed = actionSchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Check the Finance planning fields.",
          issues: parsed.error.issues,
        },
        { status: 400, headers: casaInternalNoStoreHeaders },
      );
    }

    const input = parsed.data;
    const db = getDb();
    const client = neon(getDatabaseUrl());

    if (input.action === "CREATE_BUDGET") {
      if (input.endsOn < input.startsOn) {
        return NextResponse.json(
          { message: "Budget end date cannot be before the start date." },
          { status: 400, headers: casaInternalNoStoreHeaders },
        );
      }

      const normalized = new Set<string>();
      for (const line of input.lines) {
        const key = line.category.trim().toLowerCase();
        if (normalized.has(key)) {
          return NextResponse.json(
            { message: `Budget category "${line.category}" is duplicated.` },
            { status: 400, headers: casaInternalNoStoreHeaders },
          );
        }
        normalized.add(key);
      }

      const budgetId = randomUUID();
      const statements = [
        client`
          insert into casa_finance_budgets (
            id,school_id,name,period_kind,starts_on,ends_on,status,notes,
            created_by_internal_membership_id
          )
          values (
            ${budgetId}::uuid,
            ${input.schoolId ?? null}::uuid,
            ${input.name},
            ${input.periodKind},
            ${input.startsOn}::date,
            ${input.endsOn}::date,
            'ACTIVE',
            ${input.notes?.trim() || null},
            ${access.membership.id}::uuid
          )
        `,
      ];

      for (const line of input.lines) {
        statements.push(client`
          insert into casa_finance_budget_lines (
            id,budget_id,category,planned_kobo,notes
          )
          values (
            ${randomUUID()}::uuid,
            ${budgetId}::uuid,
            ${line.category.trim()},
            ${kobo(line.plannedNaira)},
            ${line.notes?.trim() || null}
          )
        `);
      }

      await client.transaction(statements);

      await writeCasaInternalAudit({
        access,
        schoolId: input.schoolId ?? null,
        action: "FINANCE_BUDGET_CREATED",
        subjectType: "FINANCE_BUDGET",
        subjectId: budgetId,
        metadata: {
          name: input.name,
          periodKind: input.periodKind,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          lineCount: input.lines.length,
        },
      });

      return NextResponse.json(
        { created: true, budgetId },
        { status: 201, headers: casaInternalNoStoreHeaders },
      );
    }

    if (input.action === "SET_REMINDER_POLICY") {
      try {
        await db.execute(sql`
          insert into casa_finance_reminder_policies (
            school_id,is_enabled,before_due_days,overdue_every_days,
            max_overdue_reminders,updated_by_internal_membership_id
          )
          values (
            ${input.schoolId}::uuid,
            ${input.isEnabled},
            ${input.beforeDueDays},
            ${input.overdueEveryDays},
            ${input.maxOverdueReminders},
            ${access.membership.id}::uuid
          )
          on conflict (school_id)
          do update set
            is_enabled=excluded.is_enabled,
            before_due_days=excluded.before_due_days,
            overdue_every_days=excluded.overdue_every_days,
            max_overdue_reminders=excluded.max_overdue_reminders,
            updated_by_internal_membership_id=excluded.updated_by_internal_membership_id,
            updated_at=now()
        `);
      } catch (saveError) {
        console.error("Finance reminder policy save failed", saveError);
        return NextResponse.json(
          { message: "Payment reminder policy could not be saved." },
          { status: 500, headers: casaInternalNoStoreHeaders },
        );
      }

      let auditLogged = true;
      try {
        await writeCasaInternalAudit({
          access,
          schoolId: input.schoolId,
          action: "FINANCE_REMINDER_POLICY_UPDATED",
          subjectType: "FINANCE_REMINDER_POLICY",
          subjectId: input.schoolId,
          metadata: {
            isEnabled: input.isEnabled,
            beforeDueDays: input.beforeDueDays,
            overdueEveryDays: input.overdueEveryDays,
            maxOverdueReminders: input.maxOverdueReminders,
          },
        });
      } catch (auditError) {
        auditLogged = false;
        console.error(
          "Finance reminder policy saved but the CASA internal audit write failed.",
          auditError,
        );
      }

      return NextResponse.json(
        { saved: true, auditLogged },
        { headers: casaInternalNoStoreHeaders },
      );
    }

    if (input.action === "CREATE_CALENDAR_EVENT") {
      const eventId = randomUUID();

      await db.execute(sql`
        insert into casa_finance_calendar_events (
          id,school_id,title,event_type,event_date,amount_kobo,
          description,speech_text,status,created_by_internal_membership_id
        )
        values (
          ${eventId}::uuid,
          ${input.schoolId ?? null}::uuid,
          ${input.title},
          ${input.eventType},
          ${input.eventDate}::date,
          ${
            input.amountNaira === null || input.amountNaira === undefined
              ? null
              : kobo(input.amountNaira)
          },
          ${input.description},
          ${input.speechText?.trim() || null},
          'PLANNED',
          ${access.membership.id}::uuid
        )
      `);

      await writeCasaInternalAudit({
        access,
        schoolId: input.schoolId ?? null,
        action: "FINANCE_CALENDAR_EVENT_CREATED",
        subjectType: "FINANCE_CALENDAR_EVENT",
        subjectId: eventId,
        metadata: {
          title: input.title,
          eventType: input.eventType,
          eventDate: input.eventDate,
        },
      });

      return NextResponse.json(
        { created: true, eventId },
        { status: 201, headers: casaInternalNoStoreHeaders },
      );
    }

    if (input.action === "SET_CALENDAR_EVENT_STATUS") {
      const changed = rowsOf<{ id: string; school_id: string | null }>(
        await db.execute(sql`
          update casa_finance_calendar_events
          set status=${input.status},updated_at=now()
          where id=${input.eventId}::uuid
          returning id::text,school_id::text
        `),
      )[0];

      if (!changed) {
        return NextResponse.json(
          { message: "Financial calendar event not found." },
          { status: 404, headers: casaInternalNoStoreHeaders },
        );
      }

      await writeCasaInternalAudit({
        access,
        schoolId: changed.school_id,
        action: "FINANCE_CALENDAR_EVENT_STATUS_CHANGED",
        subjectType: "FINANCE_CALENDAR_EVENT",
        subjectId: input.eventId,
        metadata: { status: input.status },
      });

      return NextResponse.json(
        { updated: true },
        { headers: casaInternalNoStoreHeaders },
      );
    }

    try {
      const result = await runFinancePaymentReminderWorker({ limit: 10 });

      return NextResponse.json(
        { ran: true, ...result },
        { headers: casaInternalNoStoreHeaders },
      );
    } catch (scanError) {
      console.error("Finance payment reminder scan failed", scanError);
      return NextResponse.json(
        {
          message:
            "Payment reminder scan could not be completed. Saved reminder policies were not changed.",
        },
        { status: 500, headers: casaInternalNoStoreHeaders },
      );
    }
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;

    console.error("CASA Finance intelligence operation failed", error);
    return NextResponse.json(
      { message: "CASA could not complete Finance planning and automation." },
      { status: 500, headers: casaInternalNoStoreHeaders },
    );
  }
}
