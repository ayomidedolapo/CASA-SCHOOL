import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  CasaInternalAccessDeniedError,
  isAuthRequiredError,
  requireCasaSuperAdmin,
} from "@/server/internal/authorization";
import InternalShell from "../internal-shell";
import FinanceWorkbench from "./finance-workbench";
import FinanceIntelligence from "./finance-intelligence";
import SessionCommercialPanel from "./session-commercial-panel";

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
          School-to-CASA service-session agreements, invoices, payments,
          expenses and financial reporting. New commercial agreements are
          session based rather than term based.
        </p>
      </header>

      <SessionCommercialPanel />
      <FinanceWorkbench branches={branches} />
      <FinanceIntelligence />
    </InternalShell>
  );
}
