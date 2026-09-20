import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDatabaseUrl } from "@/config/env";
import { getDb } from "@/db";
import { listVisibleBranches, requireBranchAccess } from "@/server/school-operations/operations";
import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

const date = z.string().date();

const createSessionSchema = z.object({
  action: z.literal("CREATE_SESSION"),
  name: z.string().trim().min(2).max(80),
  startsOn: date,
  endsOn: date,
  terms: z.tuple([
    z.object({ name: z.string().trim().min(2).max(80), startsOn: date, endsOn: date }),
    z.object({ name: z.string().trim().min(2).max(80), startsOn: date, endsOn: date }),
    z.object({ name: z.string().trim().min(2).max(80), startsOn: date, endsOn: date }),
  ]),
});

const createClassArmSchema = z.object({
  action: z.literal("CREATE_CLASS_ARM"),
  sectionName: z.string().trim().min(2).max(100),
  levelName: z.string().trim().min(1).max(100),
  levelCode: z.string().trim().max(32).optional().nullable(),
  armName: z.string().trim().min(1).max(80),
  armCode: z.string().trim().max(32).optional().nullable(),
  branchId: z.string().uuid(),
});

const assignClassArmSchema = z.object({
  action: z.literal("ASSIGN_CLASS_ARM"),
  classArmId: z.string().uuid(),
  branchId: z.string().uuid(),
});

const bodySchema = z.discriminatedUnion("action", [
  createSessionSchema,
  createClassArmSchema,
  assignClassArmSchema,
]);

function rowsOf<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (
    value &&
    typeof value === "object" &&
    "rows" in value &&
    Array.isArray((value as { rows?: unknown }).rows)
  ) {
    return (value as { rows: T[] }).rows;
  }
  return [];
}

function statusFor(startsOn: string, endsOn: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (today < startsOn) return "PLANNED" as const;
  if (today > endsOn) return "CLOSED" as const;
  return "ACTIVE" as const;
}

function noStore() {
  return { "Cache-Control": "no-store" };
}

async function accessFor(slug: string) {
  return requireSchoolRole(slug, ["OWNER", "ADMIN"]);
}

function authResponse(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json({ message: "Sign in is required." }, { status: 401, headers: noStore() });
  }
  if (error instanceof SchoolAccessDeniedError) {
    return NextResponse.json({ message: "Owner or Admin access is required." }, { status: 403, headers: noStore() });
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { slug } = await context.params;

  try {
    const access = await accessFor(slug);
    const db = getDb();

    const [sessions, terms, structure, branches] = await Promise.all([
      db.execute(sql`
        select id, name, starts_on::text as starts_on, ends_on::text as ends_on, status::text as status
        from academic_sessions
        where school_id = ${access.school.id}::uuid
        order by starts_on desc
      `),
      db.execute(sql`
        select id, academic_session_id, name, position, starts_on::text as starts_on, ends_on::text as ends_on, status::text as status
        from academic_terms
        where school_id = ${access.school.id}::uuid
        order by academic_session_id, position
      `),
      db.execute(sql`
        select
          section.id as section_id,
          section.name as section_name,
          level.id as level_id,
          level.name as level_name,
          level.code as level_code,
          level.sort_order,
          arm.id as arm_id,
          arm.name as arm_name,
          arm.code as arm_code,
          mapping.branch_id,
          branch.name as branch_name
        from class_arms arm
        join class_levels level
          on level.school_id = arm.school_id
         and level.id = arm.class_level_id
        left join school_sections section
          on section.school_id = level.school_id
         and section.id = level.section_id
        left join school_branch_class_arms mapping
          on mapping.school_id = arm.school_id
         and mapping.class_arm_id = arm.id
        left join school_branches branch
          on branch.school_id = mapping.school_id
         and branch.id = mapping.branch_id
        where arm.school_id = ${access.school.id}::uuid
          and arm.is_active = true
          and level.is_active = true
        order by level.sort_order, level.name, arm.name
      `),
      db.execute(sql`
        select id, name, code, is_headquarters, status::text as status
        from school_branches
        where school_id = ${access.school.id}::uuid
          and status = 'ACTIVE'::school_branch_status
        order by is_headquarters desc, name
      `),
    ]);

    const visible = await listVisibleBranches(slug);
    const visibleIds = new Set((visible.branches as Array<{id:string}>).map((branch) => branch.id));
    const visibleBranches = rowsOf<{id:string}>(branches).filter((branch) => visibleIds.has(branch.id));
    const visibleClassArms = rowsOf<{branch_id:string|null}>(structure).filter((arm) => arm.branch_id ? visibleIds.has(arm.branch_id) : false);

    return NextResponse.json(
      {
        sessions: rowsOf(sessions),
        terms: rowsOf(terms),
        classArms: visibleClassArms,
        branches: visibleBranches,
      },
      { headers: noStore() },
    );
  } catch (error) {
    const auth = authResponse(error);
    if (auth) return auth;
    throw error;
  }
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } = await context.params;

  try {
    const access = await accessFor(slug);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Check the academic setup details.", issues: parsed.error.issues },
        { status: 400, headers: noStore() },
      );
    }

    if (parsed.data.action === "CREATE_SESSION") {
      const input = parsed.data;
      const [first, second, third] = input.terms;
      const valid =
        input.startsOn <= input.endsOn &&
        first.startsOn >= input.startsOn && first.endsOn <= input.endsOn && first.startsOn <= first.endsOn &&
        second.startsOn >= input.startsOn && second.endsOn <= input.endsOn && second.startsOn <= second.endsOn &&
        third.startsOn >= input.startsOn && third.endsOn <= input.endsOn && third.startsOn <= third.endsOn &&
        first.endsOn < second.startsOn &&
        second.endsOn < third.startsOn;

      if (!valid) {
        return NextResponse.json(
          { message: "The session must contain three ordered, non-overlapping terms inside the session dates." },
          { status: 400, headers: noStore() },
        );
      }

      const db = getDb();
      const overlap = rowsOf(
        await db.execute(sql`
          select id
          from academic_sessions
          where school_id = ${access.school.id}::uuid
            and starts_on <= ${input.endsOn}::date
            and ends_on >= ${input.startsOn}::date
          limit 1
        `),
      );

      if (overlap.length) {
        return NextResponse.json(
          { message: "This session overlaps an existing academic session." },
          { status: 409, headers: noStore() },
        );
      }

      const sessionId = randomUUID();
      const termIds = [randomUUID(), randomUUID(), randomUUID()];
      const client = neon(getDatabaseUrl());

      await client.transaction([
        client`
          insert into academic_sessions (id, school_id, name, starts_on, ends_on, status, created_at, updated_at)
          values (${sessionId}::uuid, ${access.school.id}::uuid, ${input.name}, ${input.startsOn}::date, ${input.endsOn}::date, ${statusFor(input.startsOn, input.endsOn)}::academic_period_status, now(), now())
        `,
        ...input.terms.map((term, index) => client`
          insert into academic_terms (id, school_id, academic_session_id, name, position, starts_on, ends_on, status, created_at, updated_at)
          values (${termIds[index]}::uuid, ${access.school.id}::uuid, ${sessionId}::uuid, ${term.name}, ${index + 1}, ${term.startsOn}::date, ${term.endsOn}::date, ${statusFor(term.startsOn, term.endsOn)}::academic_period_status, now(), now())
        `),
      ]);

      return NextResponse.json(
        { session: { id: sessionId, name: input.name }, termCount: 3 },
        { status: 201, headers: noStore() },
      );
    }

    if (parsed.data.action === "CREATE_CLASS_ARM") {
      const input = parsed.data;
      await requireBranchAccess(slug, input.branchId);
      const db = getDb();
      const rows = rowsOf<Record<string, unknown>>(
        await db.execute(sql`
          with valid_branch as (
            select id
            from school_branches
            where school_id = ${access.school.id}::uuid
              and id = ${input.branchId}::uuid
              and status = 'ACTIVE'::school_branch_status
          ), section_row as (
            insert into school_sections (school_id, name, code, sort_order, is_active, created_at, updated_at)
            select ${access.school.id}::uuid, ${input.sectionName}, null, 0, true, now(), now()
            where exists (select 1 from valid_branch)
            on conflict (school_id, name)
            do update set is_active = true, updated_at = now()
            returning id
          ), level_row as (
            insert into class_levels (school_id, section_id, name, code, sort_order, is_active, created_at, updated_at)
            select ${access.school.id}::uuid, section_row.id, ${input.levelName}, ${input.levelCode?.trim() || null}, 0, true, now(), now()
            from section_row
            on conflict (school_id, name)
            do update set section_id = excluded.section_id, code = excluded.code, is_active = true, updated_at = now()
            returning id
          ), arm_row as (
            insert into class_arms (school_id, class_level_id, name, code, is_active, created_at, updated_at)
            select ${access.school.id}::uuid, level_row.id, ${input.armName}, ${input.armCode?.trim() || null}, true, now(), now()
            from level_row
            on conflict (class_level_id, name)
            do update set code = excluded.code, is_active = true, updated_at = now()
            returning id, class_level_id, name
          ), mapping as (
            insert into school_branch_class_arms (school_id, branch_id, class_arm_id, created_at)
            select ${access.school.id}::uuid, ${input.branchId}::uuid, arm_row.id, now()
            from arm_row
            on conflict (school_id, class_arm_id)
            do update set branch_id = excluded.branch_id
            returning branch_id, class_arm_id
          )
          select arm_row.id as arm_id, arm_row.name as arm_name, mapping.branch_id
          from arm_row join mapping on mapping.class_arm_id = arm_row.id
        `),
      );

      if (!rows[0]) {
        return NextResponse.json(
          { message: "The selected campus is unavailable." },
          { status: 404, headers: noStore() },
        );
      }

      return NextResponse.json({ classArm: rows[0] }, { status: 201, headers: noStore() });
    }

    await requireBranchAccess(slug, parsed.data.branchId);
    const db = getDb();
    const updated = rowsOf(
      await db.execute(sql`
        with valid as (
          select arm.id
          from class_arms arm
          join school_branches branch on branch.school_id = arm.school_id
          where arm.school_id = ${access.school.id}::uuid
            and arm.id = ${parsed.data.classArmId}::uuid
            and branch.id = ${parsed.data.branchId}::uuid
            and arm.is_active = true
            and branch.status = 'ACTIVE'::school_branch_status
        )
        insert into school_branch_class_arms (school_id, branch_id, class_arm_id, created_at)
        select ${access.school.id}::uuid, ${parsed.data.branchId}::uuid, valid.id, now()
        from valid
        on conflict (school_id, class_arm_id)
        do update set branch_id = excluded.branch_id
        returning class_arm_id, branch_id
      `),
    );

    if (!updated[0]) {
      return NextResponse.json(
        { message: "Class arm or campus was not found." },
        { status: 404, headers: noStore() },
      );
    }

    return NextResponse.json({ assignment: updated[0] }, { headers: noStore() });
  } catch (error) {
    const auth = authResponse(error);
    if (auth) return auth;
    console.error("Academic setup failed", error);
    return NextResponse.json(
      { message: "Academic setup could not be saved." },
      { status: 500, headers: noStore() },
    );
  }
}
