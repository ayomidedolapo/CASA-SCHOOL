import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDatabaseUrl } from "@/config/env";
import { getDb } from "@/db";
import { requireCasaSuperAdmin } from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

export const dynamic = "force-dynamic";

const schema = z.object({
  feeType: z.enum(["STANDARD_STUDENT", "REPLACEMENT_CARD"]),
  scopeKind: z.enum(["GLOBAL", "SCHOOL", "BRANCH"]).default("GLOBAL"),
  schoolId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  amountNaira: z.number().min(0).max(100000000),
  effectiveFrom: z.string().datetime().optional(),
  agreementNote: z.string().trim().max(2000).nullable().optional(),
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

export async function GET() {
  try {
    await requireCasaSuperAdmin();
    const db = getDb();

    const rows = rowsOf(
      await db.execute(sql`
        select
          id,
          fee_type,
          scope_kind,
          school_id,
          branch_id,
          amount_kobo,
          currency,
          effective_from,
          effective_to,
          agreement_note,
          agreed_at,
          created_at
        from casa_pricing_versions
        order by effective_from desc, created_at desc
        limit 500
      `),
    );

    return NextResponse.json(
      { pricing: rows },
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
    const parsed = schema.safeParse(
      await request.json().catch(() => null),
    );

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Check the pricing fields.", issues: parsed.error.issues },
        { status: 400, headers: casaInternalNoStoreHeaders },
      );
    }

    const input = parsed.data;

    if (
      (input.scopeKind === "SCHOOL" && !input.schoolId) ||
      (
        input.scopeKind === "BRANCH" &&
        (!input.schoolId || !input.branchId)
      ) ||
      (
        input.scopeKind === "GLOBAL" &&
        (input.schoolId || input.branchId)
      )
    ) {
      return NextResponse.json(
        { message: "Pricing scope does not match the selected school/branch." },
        { status: 400, headers: casaInternalNoStoreHeaders },
      );
    }

    const schoolId = input.schoolId ?? null;
    const branchId = input.branchId ?? null;
    const amountKobo = Math.round(input.amountNaira * 100);
    const effectiveFrom = input.effectiveFrom ?? new Date().toISOString();
    const agreementNote = input.agreementNote?.trim() || null;

    const db = getDb();

    if (schoolId) {
      const schoolExists = rowsOf(
        await db.execute(sql`
          select 1
          from schools
          where id = ${schoolId}::uuid
          limit 1
        `),
      ).length === 1;

      if (!schoolExists) {
        return NextResponse.json(
          { message: "The selected school no longer exists." },
          { status: 404, headers: casaInternalNoStoreHeaders },
        );
      }
    }

    if (branchId) {
      const branchExists = rowsOf(
        await db.execute(sql`
          select 1
          from school_branches
          where id = ${branchId}::uuid
            and school_id = ${schoolId}::uuid
          limit 1
        `),
      ).length === 1;

      if (!branchExists) {
        return NextResponse.json(
          { message: "The selected branch does not belong to that school." },
          { status: 400, headers: casaInternalNoStoreHeaders },
        );
      }
    }

    const metadata = JSON.stringify({
      feeType: input.feeType,
      scopeKind: input.scopeKind,
      schoolId,
      branchId,
      amountKobo,
      effectiveFrom,
      negotiated: input.scopeKind !== "GLOBAL",
      agreementNotePresent: Boolean(agreementNote),
    });

    const client = neon(getDatabaseUrl());

    await client.transaction([
      client`
        update casa_pricing_versions
        set effective_to = ${effectiveFrom}::timestamptz
        where fee_type = ${input.feeType}
          and scope_kind = ${input.scopeKind}
          and school_id is not distinct from ${schoolId}::uuid
          and branch_id is not distinct from ${branchId}::uuid
          and effective_from < ${effectiveFrom}::timestamptz
          and (effective_to is null or effective_to > ${effectiveFrom}::timestamptz)
      `,
      client`
        insert into casa_pricing_versions (
          fee_type,
          scope_kind,
          school_id,
          branch_id,
          amount_kobo,
          effective_from,
          agreement_note,
          agreed_at,
          created_by_internal_membership_id
        )
        values (
          ${input.feeType},
          ${input.scopeKind},
          ${schoolId}::uuid,
          ${branchId}::uuid,
          ${amountKobo},
          ${effectiveFrom}::timestamptz,
          ${agreementNote},
          case
            when ${input.scopeKind} = 'GLOBAL' then null
            else now()
          end,
          ${access.membership.id}::uuid
        )
      `,
      client`
        insert into casa_internal_audit_logs (
          actor_membership_id,
          school_id,
          action,
          subject_type,
          subject_id,
          metadata,
          created_at
        )
        values (
          ${access.membership.id}::uuid,
          ${schoolId}::uuid,
          'INTERNAL_PRICING_CHANGED',
          'CASA_PRICING',
          null,
          ${metadata}::jsonb,
          now()
        )
      `,
    ]);

    return NextResponse.json(
      {
        created: true,
        pricing: {
          feeType: input.feeType,
          scopeKind: input.scopeKind,
          schoolId,
          branchId,
          amountKobo,
          effectiveFrom,
          agreementNote,
        },
      },
      { status: 201, headers: casaInternalNoStoreHeaders },
    );
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;

    console.error("CASA pricing update failed", error);
    return NextResponse.json(
      { message: "Pricing update failed." },
      { status: 500, headers: casaInternalNoStoreHeaders },
    );
  }
}