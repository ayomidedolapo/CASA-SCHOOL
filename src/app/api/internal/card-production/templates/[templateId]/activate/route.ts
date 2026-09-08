import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  firstDbRow,
} from "@/server/card-production/db-result";
import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    templateId: string;
  }>;
}

export async function POST(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const auth =
    requireInternalCardProduction(
      request,
    );

  if (!auth.ok) {
    return auth.response;
  }

  const {
    templateId,
  } =
    await context.params;

  if (
    !z.string()
      .uuid()
      .safeParse(
        templateId,
      ).success
  ) {
    return NextResponse.json(
      {
        message:
          "Invalid template ID.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const db = getDb();
  const now =
    new Date()
      .toISOString();

  const result =
    await db.execute(sql`
      with target as (
        select
          id,
          school_id
        from student_card_templates
        where
          id =
            ${templateId}::uuid
          and status in (
            'DRAFT'::student_card_template_status,
            'ACTIVE'::student_card_template_status
          )
      ),
      retired as (
        update student_card_templates
        set
          status =
            'RETIRED'::student_card_template_status,
          retired_at =
            ${now}::timestamptz,
          updated_at =
            ${now}::timestamptz
        where
          status =
            'ACTIVE'::student_card_template_status
          and school_id =
            (
              select school_id
              from target
              limit 1
            )
          and id <>
            ${templateId}::uuid
          and exists (
            select 1
            from target
          )
        returning id
      ),
      activated as (
        update student_card_templates
        set
          status =
            'ACTIVE'::student_card_template_status,
          activated_at =
            coalesce(
              activated_at,
              ${now}::timestamptz
            ),
          retired_at =
            null,
          updated_at =
            ${now}::timestamptz
        where
          id =
            ${templateId}::uuid
          and exists (
            select 1
            from target
          )
        returning
          id,
          version_label,
          status,
          activated_at
      )
      select
        id,
        version_label,
        status,
        activated_at
      from activated
    `);

  const row =
    firstDbRow<{
      id: string;
      version_label: string;
      status: string;
      activated_at: string | Date;
    }>(
      result,
    );

  if (!row) {
    return NextResponse.json(
      {
        message:
          "Draft card template not found.",
      },
      {
        status: 404,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      template:
        row,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}