import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  CasaInternalAccessDeniedError,
  isAuthRequiredError,
  requireCasaSuperAdmin,
} from "@/server/internal/authorization";
import InternalShell from "../internal-shell";
import FinanceClient from "./finance-client";

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

export default async function Page() {
  let access: Awaited<ReturnType<typeof requireCasaSuperAdmin>>;
  try {
    access = await requireCasaSuperAdmin();
  } catch (error) {
    if (isAuthRequiredError(error)) redirect("/internal/login");
    if (error instanceof CasaInternalAccessDeniedError) redirect("/internal");
    throw error;
  }

  const db = getDb();

  const schools = rowsOf<{
    id: string;
    name: string;
    slug: string;
    status: string;
    student_count: number;
    current_session_name: string | null;
    current_term_name: string | null;
    session_term_count: number;
  }>(
    await db.execute(sql`
      select
        s.id,
        s.name,
        s.slug,
        s.status::text as status,
        (
          select count(*)::int
          from students st
          where st.school_id = s.id
            and st.status = 'ACTIVE'::student_status
        ) as student_count,
        current_session.name as current_session_name,
        current_term.name as current_term_name,
        coalesce((
          select count(*)::int
          from academic_terms term_count
          where term_count.school_id = s.id
            and term_count.academic_session_id = current_session.id
        ), 0) as session_term_count
      from schools s
      left join lateral (
        select a.id, a.name, a.starts_on, a.ends_on
        from academic_sessions a
        where a.school_id = s.id
          and (
            current_date between a.starts_on and a.ends_on
            or a.status = 'ACTIVE'::academic_period_status
          )
        order by
          case when current_date between a.starts_on and a.ends_on then 0 else 1 end,
          a.starts_on desc
        limit 1
      ) current_session on true
      left join lateral (
        select t.id, t.name, t.starts_on, t.ends_on
        from academic_terms t
        where t.school_id = s.id
          and t.academic_session_id = current_session.id
          and (
            current_date between t.starts_on and t.ends_on
            or t.status = 'ACTIVE'::academic_period_status
          )
        order by
          case when current_date between t.starts_on and t.ends_on then 0 else 1 end,
          t.position asc
        limit 1
      ) current_term on true
      order by s.name
    `),
  );

  const branches = rowsOf<{
    id: string;
    school_id: string;
    name: string;
    status: string;
    student_count: number;
    enrolled_count: number;
  }>(
    await db.execute(sql`
      select
        b.id,
        b.school_id,
        b.name,
        b.status::text as status,
        (
          select count(*)::int
          from students st
          where st.school_id = b.school_id
            and st.home_branch_id = b.id
            and st.status = 'ACTIVE'::student_status
        ) as student_count,
        (
          select count(distinct e.student_id)::int
          from student_enrollments e
          join school_branch_class_arms ba
            on ba.school_id = e.school_id
           and ba.class_arm_id = e.class_arm_id
          where e.school_id = b.school_id
            and ba.branch_id = b.id
            and e.status = 'ACTIVE'::student_enrollment_status
        ) as enrolled_count
      from school_branches b
      order by b.school_id, b.is_headquarters desc, b.name
    `),
  );

  const pricing = rowsOf<{
    id: string;
    fee_type: string;
    scope_kind: string;
    school_id: string | null;
    branch_id: string | null;
    amount_kobo: string | number;
    effective_from: Date;
  }>(
    await db.execute(sql`
      select
        id,
        fee_type,
        scope_kind,
        school_id,
        branch_id,
        amount_kobo,
        effective_from
      from casa_pricing_versions
      where effective_from <= now()
        and (effective_to is null or effective_to > now())
      order by effective_from desc
    `),
  );

  const replacements = rowsOf<{
    school_id: string;
    term_count: number;
    session_count: number;
  }>(
    await db.execute(sql`
      with ranked as (
        select
          school_id,
          student_id,
          issued_at,
          row_number() over (
            partition by school_id, student_id
            order by issued_at
          ) as rn
        from student_identity_cards
      ), bounds as (
        select
          s.id as school_id,
          current_session.starts_on as session_start,
          current_session.ends_on as session_end,
          current_term.starts_on as term_start,
          current_term.ends_on as term_end
        from schools s
        left join lateral (
          select a.id, a.starts_on, a.ends_on
          from academic_sessions a
          where a.school_id = s.id
            and (
              current_date between a.starts_on and a.ends_on
              or a.status = 'ACTIVE'::academic_period_status
            )
          order by
            case when current_date between a.starts_on and a.ends_on then 0 else 1 end,
            a.starts_on desc
          limit 1
        ) current_session on true
        left join lateral (
          select t.starts_on, t.ends_on
          from academic_terms t
          where t.school_id = s.id
            and t.academic_session_id = current_session.id
            and (
              current_date between t.starts_on and t.ends_on
              or t.status = 'ACTIVE'::academic_period_status
            )
          order by
            case when current_date between t.starts_on and t.ends_on then 0 else 1 end,
            t.position asc
          limit 1
        ) current_term on true
      )
      select
        b.school_id,
        count(r.student_id) filter (
          where r.rn > 1
            and b.term_start is not null
            and r.issued_at::date between b.term_start and b.term_end
        )::int as term_count,
        count(r.student_id) filter (
          where r.rn > 1
            and b.session_start is not null
            and r.issued_at::date between b.session_start and b.session_end
        )::int as session_count
      from bounds b
      left join ranked r on r.school_id = b.school_id
      group by b.school_id
    `),
  );

  const termTrends = rowsOf<{
    school_id: string;
    school_name: string;
    session_name: string;
    term_name: string;
    position: number;
    ends_on: string | Date;
    student_count: number;
  }>(
    await db.execute(sql`
      select
        t.school_id,
        s.name as school_name,
        a.name as session_name,
        t.name as term_name,
        t.position,
        t.ends_on,
        (
          select count(*)::int
          from students st
          where st.school_id = t.school_id
            and st.admission_date <= t.ends_on
        ) as student_count
      from academic_terms t
      join academic_sessions a
        on a.school_id = t.school_id
       and a.id = t.academic_session_id
      join schools s on s.id = t.school_id
      where t.starts_on <= current_date
      order by t.ends_on asc, s.name asc
    `),
  );

  const sessionTrends = rowsOf<{
    session_name: string;
    ends_on: string | Date;
    school_count: number;
    student_count: number;
  }>(
    await db.execute(sql`
      select
        a.name as session_name,
        max(a.ends_on) as ends_on,
        count(distinct a.school_id)::int as school_count,
        sum((
          select count(*)::int
          from students st
          where st.school_id = a.school_id
            and st.admission_date <= a.ends_on
        ))::int as student_count
      from academic_sessions a
      where a.starts_on <= current_date
      group by a.name
      order by max(a.ends_on) asc
    `),
  );

  return (
    <InternalShell
      actorName={access.session.fullName}
      role={access.membership.role}
      active="finance"
    >
      <header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10">
        <p className="casa-kicker text-black/45">CASA / Finance</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
          Financial performance.
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-black/50">
          Term and academic-session estimates from active students and replacement cards. Pricing is versioned; estimates are operational forecasts, not recorded cash receipts.
        </p>
      </header>
      <FinanceClient
        schools={schools}
        branches={branches}
        pricing={pricing}
        replacements={replacements}
        termTrends={termTrends}
        sessionTrends={sessionTrends}
      />
    </InternalShell>
  );
}
