import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { requireCasaSuperAdmin } from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  schoolId: z.string().uuid(),
});

const bodySchema = z.object({
  schoolId: z.string().uuid(),
  billingContactName: z.string().trim().max(200).nullable().optional(),
  billingEmail: z.string().trim().email().max(320).nullable().optional(),
  billingPhone: z.string().trim().max(40).nullable().optional(),
  taxIdentifier: z.string().trim().max(120).nullable().optional(),
  defaultTaxLabel: z.string().trim().min(1).max(32).default("VAT"),
  defaultTaxRatePercent: z.number().min(0).max(100).default(0),
  invoiceDueDays: z.number().int().min(0).max(365).default(14),
  notes: z.string().trim().max(2000).nullable().optional(),
});

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

export async function GET(request: NextRequest) {
  try {
    await requireCasaSuperAdmin();

    const parsed = querySchema.safeParse({
      schoolId: request.nextUrl.searchParams.get("schoolId"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Select a valid school." },
        { status: 400, headers: casaInternalNoStoreHeaders },
      );
    }

    const db = getDb();

    const school = rowsOf<{
      id: string;
      name: string;
      slug: string;
      owner_name: string | null;
      owner_email: string | null;
      has_billing_profile: boolean;
      billing_contact_name: string | null;
      billing_email: string | null;
      billing_phone: string | null;
      tax_identifier: string | null;
      default_tax_label: string | null;
      default_tax_rate_bps: number | null;
      invoice_due_days: number | null;
      notes: string | null;
    }>(
      await db.execute(sql`
        select
          s.id,
          s.name,
          s.slug,
          owner.full_name as owner_name,
          owner.email as owner_email,
          (profile.school_id is not null) as has_billing_profile,
          profile.billing_contact_name,
          profile.billing_email,
          profile.billing_phone,
          profile.tax_identifier,
          profile.default_tax_label,
          profile.default_tax_rate_bps,
          profile.invoice_due_days,
          profile.notes
        from schools s
        left join lateral (
          select u.full_name, u.email
          from school_memberships m
          join school_membership_roles r
            on r.school_id = m.school_id
           and r.membership_id = m.id
           and r.role = 'OWNER'
          join users u on u.id = m.user_id
          where m.school_id = s.id
            and m.status = 'ACTIVE'
            and u.status = 'ACTIVE'::user_status
          order by m.joined_at asc
          limit 1
        ) owner on true
        left join casa_school_billing_profiles profile
          on profile.school_id = s.id
        where s.id = ${parsed.data.schoolId}::uuid
        limit 1
      `),
    )[0];

    if (!school) {
      return NextResponse.json(
        { message: "School not found." },
        { status: 404, headers: casaInternalNoStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        profile: {
          schoolId: school.id,
          schoolName: school.name,
          schoolSlug: school.slug,
          ownerName: school.owner_name,
          ownerEmail: school.owner_email,
          hasSavedBillingProfile: Boolean(school.has_billing_profile),
          billingContactName: school.billing_contact_name ?? "",
          billingEmail: school.billing_email ?? "",
          billingPhone: school.billing_phone ?? "",
          taxIdentifier: school.tax_identifier ?? "",
          defaultTaxLabel: school.default_tax_label ?? "VAT",
          defaultTaxRatePercent:
            Number(school.default_tax_rate_bps ?? 0) / 100,
          invoiceDueDays: Number(school.invoice_due_days ?? 14),
          notes: school.notes ?? "",
          effectiveInvoiceContactName:
            school.billing_contact_name ?? school.owner_name,
          effectiveInvoiceEmail:
            school.billing_email ?? school.owner_email,
          invoiceDestinationSource: school.billing_email
            ? "DEDICATED_BILLING_CONTACT"
            : school.owner_email
              ? "SCHOOL_OWNER_FALLBACK"
              : "NOT_CONFIGURED",
          usesOwnerEmailFallback: !school.billing_email && Boolean(school.owner_email),
        },
      },
      { headers: casaInternalNoStoreHeaders },
    );
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireCasaSuperAdmin();
    const parsed = bodySchema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Check the school billing fields.", issues: parsed.error.issues },
        { status: 400, headers: casaInternalNoStoreHeaders },
      );
    }

    const input = parsed.data;
    const db = getDb();

    const schoolExists = rowsOf(
      await db.execute(sql`
        select 1 from schools
        where id = ${input.schoolId}::uuid
        limit 1
      `),
    ).length === 1;

    if (!schoolExists) {
      return NextResponse.json(
        { message: "School not found." },
        { status: 404, headers: casaInternalNoStoreHeaders },
      );
    }

    const taxRateBps = Math.round(input.defaultTaxRatePercent * 100);

    await db.execute(sql`
      insert into casa_school_billing_profiles (
        school_id,
        billing_contact_name,
        billing_email,
        billing_phone,
        tax_identifier,
        default_tax_label,
        default_tax_rate_bps,
        invoice_due_days,
        notes,
        updated_by_internal_membership_id,
        created_at,
        updated_at
      )
      values (
        ${input.schoolId}::uuid,
        ${input.billingContactName?.trim() || null},
        ${input.billingEmail?.trim().toLowerCase() || null},
        ${input.billingPhone?.trim() || null},
        ${input.taxIdentifier?.trim() || null},
        ${input.defaultTaxLabel.trim()},
        ${taxRateBps},
        ${input.invoiceDueDays},
        ${input.notes?.trim() || null},
        ${access.membership.id}::uuid,
        now(),
        now()
      )
      on conflict (school_id)
      do update set
        billing_contact_name = excluded.billing_contact_name,
        billing_email = excluded.billing_email,
        billing_phone = excluded.billing_phone,
        tax_identifier = excluded.tax_identifier,
        default_tax_label = excluded.default_tax_label,
        default_tax_rate_bps = excluded.default_tax_rate_bps,
        invoice_due_days = excluded.invoice_due_days,
        notes = excluded.notes,
        updated_by_internal_membership_id =
          excluded.updated_by_internal_membership_id,
        updated_at = now()
    `);

    await writeCasaInternalAudit({
      access,
      schoolId: input.schoolId,
      action: "FINANCE_BILLING_PROFILE_UPDATED",
      subjectType: "SCHOOL",
      subjectId: input.schoolId,
      metadata: {
        billingEmailConfigured: Boolean(input.billingEmail),
        defaultTaxLabel: input.defaultTaxLabel,
        defaultTaxRateBps: taxRateBps,
        invoiceDueDays: input.invoiceDueDays,
      },
    });

    return NextResponse.json(
      { updated: true },
      { headers: casaInternalNoStoreHeaders },
    );
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;

    console.error("CASA billing profile update failed", error);
    return NextResponse.json(
      { message: "Billing profile update failed." },
      { status: 500, headers: casaInternalNoStoreHeaders },
    );
  }
}