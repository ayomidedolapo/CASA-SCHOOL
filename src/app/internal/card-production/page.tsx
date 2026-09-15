import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { CasaInternalAccessDeniedError, CasaInternalCapabilityError, isAuthRequiredError, requireCasaCapability } from "@/server/internal/authorization";
import InternalShell from "../internal-shell";
import CardProductionClient from "./card-production-client";

function rowsOf<T>(result: unknown): T[] { if (Array.isArray(result)) return result as T[]; if (result && typeof result === "object" && "rows" in result && Array.isArray((result as {rows?:unknown}).rows)) return (result as {rows:T[]}).rows; return []; }
function iso(value: unknown): string | null { if (value === null || value === undefined || value === "") return null; const date = value instanceof Date ? value : new Date(String(value)); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }

export default async function InternalCardProductionPage() {
  let access: Awaited<ReturnType<typeof requireCasaCapability>>;
  try { access = await requireCasaCapability("CARD_PRODUCTION_ADMIN"); } catch (error) {
    if (isAuthRequiredError(error)) redirect("/internal/login");
    if (error instanceof CasaInternalCapabilityError || error instanceof CasaInternalAccessDeniedError) redirect("/internal/operations?denied=card-production");
    throw error;
  }
  const db = getDb();
  const schools = rowsOf<{id:string;name:string;slug:string}>(await db.execute(sql`select id,name,slug from schools where status='ACTIVE'::school_status order by name asc`));
  const branches = rowsOf<{id:string;school_id:string;name:string}>(await db.execute(sql`select id,school_id,name from school_branches where status='ACTIVE' order by school_id,is_headquarters desc,name`));
  const templates = rowsOf<{id:string;school_id:string;school_name:string;version_label:string;status:string;activated_at:Date|string|null;created_at:Date|string}>(await db.execute(sql`
    select t.id,t.school_id,s.name as school_name,t.version_label,t.status::text as status,t.activated_at,t.created_at
    from student_card_templates t join schools s on s.id=t.school_id
    order by t.created_at desc limit 200
  `));
  return <InternalShell actorName={access.session.fullName} role={access.membership.role} active="operations">
    <header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10 lg:py-9"><p className="casa-kicker text-black/45">CASA / Operations / Card production</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Central card production.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-black/50">Filter production by organization and branch. Every row keeps the exact school template version used for that student card.</p></header>
    <CardProductionClient schools={schools} branches={branches} templates={templates.map((template) => ({ ...template, activated_at: iso(template.activated_at), created_at: iso(template.created_at) ?? String(template.created_at) }))} />
  </InternalShell>;
}
