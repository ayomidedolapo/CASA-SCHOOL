-- CASA M65 Finance Intelligence + Automation
-- Additive budgeting, automatic payment reminders, and financial calendar.

CREATE TABLE IF NOT EXISTS "casa_finance_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid REFERENCES "schools"("id") ON DELETE SET NULL,
  "name" varchar(200) NOT NULL,
  "period_kind" varchar(24) NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'ACTIVE',
  "notes" text,
  "created_by_internal_membership_id" uuid NOT NULL
    REFERENCES "casa_internal_memberships"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_budgets_period_kind_check"
    CHECK ("period_kind" IN ('MONTHLY','QUARTERLY','ANNUAL','CUSTOM')),
  CONSTRAINT "casa_finance_budgets_status_check"
    CHECK ("status" IN ('DRAFT','ACTIVE','CLOSED')),
  CONSTRAINT "casa_finance_budgets_dates_check"
    CHECK ("ends_on" >= "starts_on")
);

CREATE INDEX IF NOT EXISTS "casa_finance_budgets_period_idx"
ON "casa_finance_budgets" ("status","starts_on","ends_on");

CREATE TABLE IF NOT EXISTS "casa_finance_budget_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "budget_id" uuid NOT NULL
    REFERENCES "casa_finance_budgets"("id") ON DELETE CASCADE,
  "category" varchar(80) NOT NULL,
  "planned_kobo" bigint NOT NULL,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_budget_lines_amount_check"
    CHECK ("planned_kobo" >= 0),
  CONSTRAINT "casa_finance_budget_lines_category_unique"
    UNIQUE ("budget_id","category")
);

CREATE INDEX IF NOT EXISTS "casa_finance_budget_lines_budget_idx"
ON "casa_finance_budget_lines" ("budget_id");

CREATE TABLE IF NOT EXISTS "casa_finance_reminder_policies" (
  "school_id" uuid PRIMARY KEY REFERENCES "schools"("id") ON DELETE CASCADE,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "before_due_days" integer NOT NULL DEFAULT 3,
  "overdue_every_days" integer NOT NULL DEFAULT 3,
  "max_overdue_reminders" integer NOT NULL DEFAULT 5,
  "updated_by_internal_membership_id" uuid
    REFERENCES "casa_internal_memberships"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_reminder_before_due_check"
    CHECK ("before_due_days" BETWEEN 0 AND 30),
  CONSTRAINT "casa_finance_reminder_overdue_every_check"
    CHECK ("overdue_every_days" BETWEEN 1 AND 30),
  CONSTRAINT "casa_finance_reminder_max_check"
    CHECK ("max_overdue_reminders" BETWEEN 1 AND 20)
);

CREATE TABLE IF NOT EXISTS "casa_finance_payment_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL
    REFERENCES "casa_finance_invoices"("id") ON DELETE CASCADE,
  "school_id" uuid NOT NULL
    REFERENCES "schools"("id") ON DELETE CASCADE,
  "reminder_kind" varchar(24) NOT NULL,
  "scheduled_for" date NOT NULL,
  "recipient_email" varchar(320) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'PENDING',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
  "provider_message_id" varchar(240),
  "last_error" varchar(1000),
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_payment_reminders_kind_check"
    CHECK ("reminder_kind" IN ('UPCOMING_DUE','OVERDUE')),
  CONSTRAINT "casa_finance_payment_reminders_status_check"
    CHECK ("status" IN ('PENDING','PROCESSING','RETRY','SENT','FAILED','SKIPPED')),
  CONSTRAINT "casa_finance_payment_reminders_attempt_check"
    CHECK ("attempt_count" >= 0),
  CONSTRAINT "casa_finance_payment_reminders_unique"
    UNIQUE ("invoice_id","reminder_kind","scheduled_for")
);

CREATE INDEX IF NOT EXISTS "casa_finance_payment_reminders_due_idx"
ON "casa_finance_payment_reminders" ("status","next_attempt_at");

CREATE INDEX IF NOT EXISTS "casa_finance_payment_reminders_invoice_idx"
ON "casa_finance_payment_reminders" ("invoice_id","created_at" DESC);

CREATE TABLE IF NOT EXISTS "casa_finance_calendar_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid REFERENCES "schools"("id") ON DELETE SET NULL,
  "title" varchar(200) NOT NULL,
  "event_type" varchar(32) NOT NULL DEFAULT 'OTHER',
  "event_date" date NOT NULL,
  "amount_kobo" bigint,
  "description" text NOT NULL,
  "speech_text" varchar(320),
  "status" varchar(16) NOT NULL DEFAULT 'PLANNED',
  "created_by_internal_membership_id" uuid NOT NULL
    REFERENCES "casa_internal_memberships"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_calendar_events_type_check"
    CHECK ("event_type" IN ('BUDGET_REVIEW','EXPECTED_PAYMENT','EXPENSE_DUE','TAX','OTHER')),
  CONSTRAINT "casa_finance_calendar_events_status_check"
    CHECK ("status" IN ('PLANNED','COMPLETED','CANCELLED')),
  CONSTRAINT "casa_finance_calendar_events_amount_check"
    CHECK ("amount_kobo" IS NULL OR "amount_kobo" >= 0)
);

CREATE INDEX IF NOT EXISTS "casa_finance_calendar_events_date_idx"
ON "casa_finance_calendar_events" ("event_date","status");
