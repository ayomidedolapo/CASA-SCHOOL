-- CASA Internal Control Plane Closure
-- Additive only. No destructive schema changes.

CREATE TABLE IF NOT EXISTS "casa_account_setup_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" varchar(64) NOT NULL,
  "purpose" varchar(32) NOT NULL,
  "created_by_internal_membership_id" uuid REFERENCES "casa_internal_memberships"("id") ON DELETE SET NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "casa_account_setup_tokens_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "casa_account_setup_tokens_hash_format_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "casa_account_setup_tokens_purpose_check" CHECK ("purpose" IN ('CASA_INTERNAL','SCHOOL_OWNER')),
  CONSTRAINT "casa_account_setup_tokens_expiry_check" CHECK ("expires_at" > "created_at")
);

CREATE INDEX IF NOT EXISTS "casa_account_setup_tokens_user_open_idx"
ON "casa_account_setup_tokens" ("user_id", "expires_at")
WHERE "used_at" IS NULL;

CREATE TABLE IF NOT EXISTS "casa_pricing_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fee_type" varchar(32) NOT NULL,
  "scope_kind" varchar(16) NOT NULL DEFAULT 'GLOBAL',
  "school_id" uuid REFERENCES "schools"("id") ON DELETE CASCADE,
  "branch_id" uuid REFERENCES "school_branches"("id") ON DELETE CASCADE,
  "amount_kobo" bigint NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'NGN',
  "effective_from" timestamptz NOT NULL DEFAULT now(),
  "effective_to" timestamptz,
  "created_by_internal_membership_id" uuid NOT NULL REFERENCES "casa_internal_memberships"("id"),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "casa_pricing_versions_fee_type_check" CHECK ("fee_type" IN ('STANDARD_STUDENT','REPLACEMENT_CARD')),
  CONSTRAINT "casa_pricing_versions_scope_kind_check" CHECK ("scope_kind" IN ('GLOBAL','SCHOOL','BRANCH')),
  CONSTRAINT "casa_pricing_versions_amount_check" CHECK ("amount_kobo" >= 0),
  CONSTRAINT "casa_pricing_versions_currency_check" CHECK ("currency" = 'NGN'),
  CONSTRAINT "casa_pricing_versions_scope_shape_check" CHECK (
    ("scope_kind"='GLOBAL' AND "school_id" IS NULL AND "branch_id" IS NULL) OR
    ("scope_kind"='SCHOOL' AND "school_id" IS NOT NULL AND "branch_id" IS NULL) OR
    ("scope_kind"='BRANCH' AND "school_id" IS NOT NULL AND "branch_id" IS NOT NULL)
  ),
  CONSTRAINT "casa_pricing_versions_dates_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE INDEX IF NOT EXISTS "casa_pricing_versions_lookup_idx"
ON "casa_pricing_versions" ("fee_type","scope_kind","school_id","branch_id","effective_from" DESC);

CREATE TABLE IF NOT EXISTS "casa_school_suspension_branch_state" (
  "school_id" uuid NOT NULL REFERENCES "schools"("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "school_branches"("id") ON DELETE CASCADE,
  "was_active" boolean NOT NULL,
  "captured_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("school_id","branch_id")
);
