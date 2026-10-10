-- CASA M67 Session Commercial Model
-- Additive commercial agreement foundation. Historical Finance records remain untouched.

CREATE TABLE IF NOT EXISTS "casa_finance_commercial_defaults" (
  "id" smallint PRIMARY KEY DEFAULT 1,
  "base_session_fee_kobo" bigint NOT NULL DEFAULT 55000000,
  "student_rate_kobo" bigint NOT NULL DEFAULT 200000,
  "card_service_fee_kobo" bigint NOT NULL DEFAULT 3000000,
  "currency" varchar(3) NOT NULL DEFAULT 'NGN',
  "updated_by_internal_membership_id" uuid REFERENCES "casa_internal_memberships"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_commercial_defaults_singleton_check" CHECK ("id" = 1),
  CONSTRAINT "casa_finance_commercial_defaults_currency_check" CHECK ("currency" = 'NGN'),
  CONSTRAINT "casa_finance_commercial_defaults_amounts_check" CHECK (
    "base_session_fee_kobo" >= 0 AND "student_rate_kobo" >= 0 AND "card_service_fee_kobo" >= 0
  )
);

INSERT INTO "casa_finance_commercial_defaults" (
  "id","base_session_fee_kobo","student_rate_kobo","card_service_fee_kobo"
) VALUES (1,55000000,200000,3000000)
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "casa_finance_session_agreements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE RESTRICT,
  "status" varchar(20) NOT NULL DEFAULT 'DRAFT',
  "service_session_label" varchar(160),
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "student_count" integer NOT NULL,
  "base_session_fee_kobo" bigint NOT NULL,
  "student_rate_kobo" bigint NOT NULL,
  "student_component_kobo" bigint NOT NULL,
  "card_service_fee_kobo" bigint NOT NULL,
  "calculated_total_kobo" bigint NOT NULL,
  "agreed_total_kobo" bigint NOT NULL,
  "payment_plan" varchar(24) NOT NULL,
  "first_installment_kobo" bigint NOT NULL,
  "first_due_on" date NOT NULL,
  "second_installment_kobo" bigint,
  "second_due_on" date,
  "agreement_note" text,
  "agreed_at" timestamptz,
  "created_by_internal_membership_id" uuid NOT NULL REFERENCES "casa_internal_memberships"("id") ON DELETE RESTRICT,
  "updated_by_internal_membership_id" uuid NOT NULL REFERENCES "casa_internal_memberships"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_finance_session_agreements_status_check" CHECK ("status" IN ('DRAFT','AGREED','ACTIVE','COMPLETED','CANCELLED')),
  CONSTRAINT "casa_finance_session_agreements_dates_check" CHECK ("ends_on" >= "starts_on"),
  CONSTRAINT "casa_finance_session_agreements_student_check" CHECK ("student_count" >= 0),
  CONSTRAINT "casa_finance_session_agreements_formula_check" CHECK (
    "student_component_kobo" = ("student_count"::bigint * "student_rate_kobo") AND
    "calculated_total_kobo" = "base_session_fee_kobo" + "student_component_kobo" + "card_service_fee_kobo"
  ),
  CONSTRAINT "casa_finance_session_agreements_payment_plan_check" CHECK ("payment_plan" IN ('FULL','TWO_INSTALLMENTS')),
  CONSTRAINT "casa_finance_session_agreements_installment_check" CHECK (
    ("payment_plan"='FULL' AND "first_installment_kobo"="agreed_total_kobo" AND "second_installment_kobo" IS NULL AND "second_due_on" IS NULL)
    OR
    ("payment_plan"='TWO_INSTALLMENTS' AND "second_installment_kobo" IS NOT NULL AND "second_due_on" IS NOT NULL AND "first_installment_kobo"+"second_installment_kobo"="agreed_total_kobo" AND "second_due_on">="first_due_on")
  )
);

CREATE INDEX IF NOT EXISTS "casa_finance_session_agreements_school_idx"
ON "casa_finance_session_agreements" ("school_id","status","starts_on" DESC);

ALTER TABLE "casa_finance_invoices"
  ADD COLUMN IF NOT EXISTS "session_agreement_id" uuid REFERENCES "casa_finance_session_agreements"("id") ON DELETE SET NULL;
ALTER TABLE "casa_finance_invoices" ADD COLUMN IF NOT EXISTS "installment_sequence" smallint;
ALTER TABLE "casa_finance_invoices" DROP CONSTRAINT IF EXISTS "casa_finance_invoices_installment_sequence_check";
ALTER TABLE "casa_finance_invoices" ADD CONSTRAINT "casa_finance_invoices_installment_sequence_check"
  CHECK ("installment_sequence" IS NULL OR "installment_sequence" IN (1,2));
CREATE INDEX IF NOT EXISTS "casa_finance_invoices_session_agreement_idx"
ON "casa_finance_invoices" ("session_agreement_id","installment_sequence");

CREATE UNIQUE INDEX IF NOT EXISTS "casa_finance_invoices_session_installment_unique"
ON "casa_finance_invoices" ("session_agreement_id","installment_sequence")
WHERE "session_agreement_id" IS NOT NULL
  AND "status" <> 'VOID';
