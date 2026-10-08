-- CASA M64 Finance Foundation
-- Additive finance/accounting foundation.
-- No destructive changes to existing pricing data.

ALTER TABLE "casa_pricing_versions"
  ADD COLUMN IF NOT EXISTS "agreement_note" text;

ALTER TABLE "casa_pricing_versions"
  ADD COLUMN IF NOT EXISTS "agreed_at" timestamptz;

CREATE TABLE IF NOT EXISTS "casa_school_billing_profiles" (
  "school_id" uuid PRIMARY KEY REFERENCES "schools"("id") ON DELETE CASCADE,
  "billing_contact_name" varchar(200),
  "billing_email" varchar(320),
  "billing_phone" varchar(40),
  "tax_identifier" varchar(120),
  "default_tax_label" varchar(32) NOT NULL DEFAULT 'VAT',
  "default_tax_rate_bps" integer NOT NULL DEFAULT 0,
  "invoice_due_days" integer NOT NULL DEFAULT 14,
  "notes" text,
  "updated_by_internal_membership_id" uuid
    REFERENCES "casa_internal_memberships"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_school_billing_profiles_tax_rate_check"
    CHECK ("default_tax_rate_bps" BETWEEN 0 AND 10000),
  CONSTRAINT "casa_school_billing_profiles_due_days_check"
    CHECK ("invoice_due_days" BETWEEN 0 AND 365),
  CONSTRAINT "casa_school_billing_profiles_email_check"
    CHECK ("billing_email" IS NULL OR position('@' in "billing_email") > 1)
);

CREATE TABLE IF NOT EXISTS "casa_finance_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE RESTRICT,
  "invoice_number" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'DRAFT',
  "bill_to_name" varchar(240) NOT NULL,
  "bill_to_contact_name" varchar(200),
  "bill_to_email" varchar(320),
  "bill_to_phone" varchar(40),
  "currency" varchar(3) NOT NULL DEFAULT 'NGN',
  "subtotal_kobo" bigint NOT NULL DEFAULT 0,
  "tax_label" varchar(32) NOT NULL DEFAULT 'VAT',
  "tax_rate_bps" integer NOT NULL DEFAULT 0,
  "tax_kobo" bigint NOT NULL DEFAULT 0,
  "total_kobo" bigint NOT NULL DEFAULT 0,
  "issued_on" date,
  "due_on" date,
  "issued_at" timestamptz,
  "sent_at" timestamptz,
  "paid_at" timestamptz,
  "notes" text,
  "created_by_internal_membership_id" uuid NOT NULL
    REFERENCES "casa_internal_memberships"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_invoices_number_unique" UNIQUE ("invoice_number"),
  CONSTRAINT "casa_finance_invoices_status_check"
    CHECK ("status" IN ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','OVERDUE','VOID')),
  CONSTRAINT "casa_finance_invoices_currency_check"
    CHECK ("currency" = 'NGN'),
  CONSTRAINT "casa_finance_invoices_amounts_check"
    CHECK (
      "subtotal_kobo" >= 0 AND
      "tax_kobo" >= 0 AND
      "total_kobo" >= 0 AND
      "total_kobo" = "subtotal_kobo" + "tax_kobo"
    ),
  CONSTRAINT "casa_finance_invoices_tax_rate_check"
    CHECK ("tax_rate_bps" BETWEEN 0 AND 10000),
  CONSTRAINT "casa_finance_invoices_dates_check"
    CHECK ("issued_on" IS NULL OR "due_on" IS NULL OR "due_on" >= "issued_on")
);

CREATE INDEX IF NOT EXISTS "casa_finance_invoices_school_status_idx"
ON "casa_finance_invoices" ("school_id","status","due_on");

CREATE INDEX IF NOT EXISTS "casa_finance_invoices_created_idx"
ON "casa_finance_invoices" ("created_at" DESC);

CREATE TABLE IF NOT EXISTS "casa_finance_invoice_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL
    REFERENCES "casa_finance_invoices"("id") ON DELETE CASCADE,
  "line_kind" varchar(32) NOT NULL DEFAULT 'OTHER',
  "description" varchar(500) NOT NULL,
  "quantity" numeric(14,2) NOT NULL DEFAULT 1,
  "unit_amount_kobo" bigint NOT NULL,
  "amount_kobo" bigint NOT NULL,
  "pricing_version_id" uuid
    REFERENCES "casa_pricing_versions"("id") ON DELETE SET NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_invoice_lines_kind_check"
    CHECK ("line_kind" IN ('SERVICE_FEE','REPLACEMENT_CARD','OTHER')),
  CONSTRAINT "casa_finance_invoice_lines_quantity_check"
    CHECK ("quantity" > 0),
  CONSTRAINT "casa_finance_invoice_lines_amount_check"
    CHECK ("unit_amount_kobo" >= 0 AND "amount_kobo" >= 0)
);

CREATE INDEX IF NOT EXISTS "casa_finance_invoice_lines_invoice_idx"
ON "casa_finance_invoice_lines" ("invoice_id","sort_order");

CREATE TABLE IF NOT EXISTS "casa_finance_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL
    REFERENCES "casa_finance_invoices"("id") ON DELETE RESTRICT,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE RESTRICT,
  "receipt_number" varchar(64) NOT NULL,
  "amount_kobo" bigint NOT NULL,
  "payment_method" varchar(32) NOT NULL DEFAULT 'BANK_TRANSFER',
  "payment_reference" varchar(160),
  "received_on" date NOT NULL,
  "notes" text,
  "created_by_internal_membership_id" uuid NOT NULL
    REFERENCES "casa_internal_memberships"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_payments_receipt_unique" UNIQUE ("receipt_number"),
  CONSTRAINT "casa_finance_payments_amount_check" CHECK ("amount_kobo" > 0),
  CONSTRAINT "casa_finance_payments_method_check"
    CHECK ("payment_method" IN ('BANK_TRANSFER','CASH','CARD','OTHER'))
);

CREATE INDEX IF NOT EXISTS "casa_finance_payments_invoice_idx"
ON "casa_finance_payments" ("invoice_id","received_on");

CREATE INDEX IF NOT EXISTS "casa_finance_payments_school_idx"
ON "casa_finance_payments" ("school_id","received_on");

CREATE TABLE IF NOT EXISTS "casa_finance_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "expense_number" varchar(64) NOT NULL,
  "vendor" varchar(240) NOT NULL,
  "category" varchar(80) NOT NULL,
  "description" text NOT NULL,
  "amount_kobo" bigint NOT NULL,
  "tax_kobo" bigint NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'NGN',
  "payment_method" varchar(32) NOT NULL DEFAULT 'BANK_TRANSFER',
  "payment_reference" varchar(160),
  "incurred_on" date NOT NULL,
  "paid_on" date,
  "school_id" uuid REFERENCES "schools"("id") ON DELETE SET NULL,
  "recurring_expense_id" uuid,
  "notes" text,
  "created_by_internal_membership_id" uuid NOT NULL
    REFERENCES "casa_internal_memberships"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_expenses_number_unique" UNIQUE ("expense_number"),
  CONSTRAINT "casa_finance_expenses_amount_check"
    CHECK ("amount_kobo" > 0 AND "tax_kobo" >= 0 AND "tax_kobo" <= "amount_kobo"),
  CONSTRAINT "casa_finance_expenses_currency_check" CHECK ("currency" = 'NGN'),
  CONSTRAINT "casa_finance_expenses_method_check"
    CHECK ("payment_method" IN ('BANK_TRANSFER','CASH','CARD','OTHER'))
);

CREATE INDEX IF NOT EXISTS "casa_finance_expenses_date_idx"
ON "casa_finance_expenses" ("incurred_on" DESC);

CREATE INDEX IF NOT EXISTS "casa_finance_expenses_category_idx"
ON "casa_finance_expenses" ("category","incurred_on" DESC);

CREATE TABLE IF NOT EXISTS "casa_finance_recurring_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(200) NOT NULL,
  "vendor" varchar(240) NOT NULL,
  "category" varchar(80) NOT NULL,
  "amount_kobo" bigint NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'NGN',
  "cadence" varchar(24) NOT NULL,
  "next_due_on" date NOT NULL,
  "school_id" uuid REFERENCES "schools"("id") ON DELETE SET NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_by_internal_membership_id" uuid NOT NULL
    REFERENCES "casa_internal_memberships"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_recurring_expenses_amount_check" CHECK ("amount_kobo" > 0),
  CONSTRAINT "casa_finance_recurring_expenses_currency_check" CHECK ("currency" = 'NGN'),
  CONSTRAINT "casa_finance_recurring_expenses_cadence_check"
    CHECK ("cadence" IN ('MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL'))
);

CREATE INDEX IF NOT EXISTS "casa_finance_recurring_expenses_due_idx"
ON "casa_finance_recurring_expenses" ("is_active","next_due_on");

ALTER TABLE "casa_finance_expenses"
  DROP CONSTRAINT IF EXISTS "casa_finance_expenses_recurring_fk";

ALTER TABLE "casa_finance_expenses"
  ADD CONSTRAINT "casa_finance_expenses_recurring_fk"
  FOREIGN KEY ("recurring_expense_id")
  REFERENCES "casa_finance_recurring_expenses"("id")
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS "casa_finance_email_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid REFERENCES "schools"("id") ON DELETE SET NULL,
  "invoice_id" uuid REFERENCES "casa_finance_invoices"("id") ON DELETE CASCADE,
  "delivery_kind" varchar(32) NOT NULL,
  "recipient_email" varchar(320) NOT NULL,
  "provider_message_id" varchar(240),
  "status" varchar(24) NOT NULL,
  "error_code" varchar(80),
  "sent_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_email_deliveries_kind_check"
    CHECK ("delivery_kind" IN ('INVOICE','PAYMENT_REMINDER','RECEIPT')),
  CONSTRAINT "casa_finance_email_deliveries_status_check"
    CHECK ("status" IN ('PENDING','SENT','FAILED','NOT_CONFIGURED'))
);

CREATE INDEX IF NOT EXISTS "casa_finance_email_invoice_idx"
ON "casa_finance_email_deliveries" ("invoice_id","delivery_kind","created_at" DESC);

CREATE TABLE IF NOT EXISTS "casa_finance_ledger_accounts" (
  "code" varchar(16) PRIMARY KEY,
  "name" varchar(120) NOT NULL,
  "account_type" varchar(16) NOT NULL,
  "is_system" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_ledger_accounts_type_check"
    CHECK ("account_type" IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'))
);

CREATE TABLE IF NOT EXISTS "casa_finance_journal_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_type" varchar(32) NOT NULL,
  "source_id" uuid NOT NULL,
  "school_id" uuid REFERENCES "schools"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "posted_on" date NOT NULL,
  "created_by_internal_membership_id" uuid
    REFERENCES "casa_internal_memberships"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_journal_entries_source_unique"
    UNIQUE ("source_type","source_id"),
  CONSTRAINT "casa_finance_journal_entries_source_check"
    CHECK ("source_type" IN ('INVOICE_ISSUED','PAYMENT_RECEIVED','EXPENSE_RECORDED','ADJUSTMENT'))
);

CREATE INDEX IF NOT EXISTS "casa_finance_journal_entries_date_idx"
ON "casa_finance_journal_entries" ("posted_on" DESC);

CREATE TABLE IF NOT EXISTS "casa_finance_journal_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "journal_entry_id" uuid NOT NULL
    REFERENCES "casa_finance_journal_entries"("id") ON DELETE CASCADE,
  "account_code" varchar(16) NOT NULL
    REFERENCES "casa_finance_ledger_accounts"("code") ON DELETE RESTRICT,
  "debit_kobo" bigint NOT NULL DEFAULT 0,
  "credit_kobo" bigint NOT NULL DEFAULT 0,
  "memo" varchar(300),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_journal_lines_one_side_check"
    CHECK (
      ("debit_kobo" > 0 AND "credit_kobo" = 0) OR
      ("credit_kobo" > 0 AND "debit_kobo" = 0)
    )
);

CREATE INDEX IF NOT EXISTS "casa_finance_journal_lines_entry_idx"
ON "casa_finance_journal_lines" ("journal_entry_id");

CREATE INDEX IF NOT EXISTS "casa_finance_journal_lines_account_idx"
ON "casa_finance_journal_lines" ("account_code");

INSERT INTO "casa_finance_ledger_accounts" ("code","name","account_type","is_system")
VALUES
  ('1000','Cash / Bank','ASSET',true),
  ('1100','Accounts Receivable','ASSET',true),
  ('2000','Tax Payable','LIABILITY',true),
  ('4000','CASA Service Revenue','REVENUE',true),
  ('4010','Replacement Card Revenue','REVENUE',true),
  ('4090','Other Revenue','REVENUE',true),
  ('5000','Operating Expenses','EXPENSE',true)
ON CONFLICT ("code") DO NOTHING;