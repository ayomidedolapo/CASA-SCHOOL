import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  CasaInternalAccessDeniedError,
  CasaInternalCapabilityError,
  isAuthRequiredError,
  requireCasaCapability,
} from "@/server/internal/authorization";
import InternalShell from "../internal-shell";
import TemplateDesigner from "./template-designer";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows?: unknown }).rows)) return (result as { rows: T[] }).rows;
  return [];
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default async function Page() {
  let access: Awaited<ReturnType<typeof requireCasaCapability>>;
  try {
    access = await requireCasaCapability("MASTER_TEMPLATE_ADMIN");
  } catch (error) {
    if (isAuthRequiredError(error)) redirect("/internal/login");
    if (error instanceof CasaInternalAccessDeniedError || error instanceof CasaInternalCapabilityError) redirect("/internal/operations?denied=templates");
    throw error;
  }

  const db = getDb();
  const schools = rowsOf<{ id: string; name: string }>(await db.execute(sql`select id,name from schools where status='ACTIVE' order by name`));
  const templates = rowsOf<{ id: string; school_id: string; school_name: string; version_label: string; status: string; layout: unknown; created_at: Date | string; updated_at: Date | string; activated_at: Date | string | null; version_count: number }>(await db.execute(sql`
    with ranked as (
      select
        t.id,
        t.school_id,
        s.name as school_name,
        t.version_label,
        t.status::text as status,
        t.layout,
        t.created_at,
        t.updated_at,
        t.activated_at,
        count(*) over (partition by t.school_id)::int as version_count,
        row_number() over (
          partition by t.school_id
          order by
            case t.status when 'ACTIVE' then 0 when 'DRAFT' then 1 else 2 end,
            t.updated_at desc,
            t.created_at desc
        ) as display_rank
      from student_card_templates t
      join schools s on s.id = t.school_id
    )
    select id,school_id,school_name,version_label,status,layout,created_at,updated_at,activated_at,version_count
    from ranked
    where display_rank = 1
    order by school_name asc
  `));

  return <InternalShell actorName={access.session.fullName} role={access.membership.role} active="templates">
    <header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10">
      <p className="casa-kicker text-black/45">CASA / Card templates</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">One current design per school.</h1>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-black/50">The gallery shows one current design for each school. Editing a published design preserves older production history internally but does not create extra visible gallery cards.</p>
    </header>
    <TemplateDesigner
      schools={schools}
      templates={templates.map((template) => ({ ...template, created_at: iso(template.created_at) ?? String(template.created_at), updated_at: iso(template.updated_at) ?? String(template.updated_at), activated_at: iso(template.activated_at) }))}
    />
  </InternalShell>;
}
