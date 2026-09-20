import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reconcileTerminalHealthNotifications } from "@/server/internal/terminal-health";
import { CasaInternalAccessDeniedError, isAuthRequiredError, requireCasaInternalAccess } from "@/server/internal/authorization";
import InternalShell from "./internal-shell";

function rowsOf<T>(r: unknown): T[] { if (Array.isArray(r)) return r as T[]; if (r && typeof r === "object" && "rows" in r && Array.isArray((r as {rows?:unknown}).rows)) return (r as {rows:T[]}).rows; return []; }

export default async function InternalHomePage() {
  let access: Awaited<ReturnType<typeof requireCasaInternalAccess>>;
  try { access = await requireCasaInternalAccess(); } catch (error) { if (isAuthRequiredError(error)) redirect("/internal/login"); if (error instanceof CasaInternalAccessDeniedError) redirect("/internal/login?denied=1"); throw error; }
  const db=getDb();
  await reconcileTerminalHealthNotifications();
  const health=rowsOf<{unread:number;offline:number}>(await db.execute(sql`
    select
      (select count(*)::int from casa_in_app_notifications n where n.recipient_internal_membership_id=${access.membership.id}::uuid and n.read_at is null) unread,
      (select count(*)::int from attendance_terminal_health_states h where h.observed_status='OFFLINE' and (${access.membership.role}='CASA_SUPER_ADMIN' or exists(select 1 from casa_internal_school_assignments a where a.membership_id=${access.membership.id}::uuid and a.school_id=h.school_id and a.status='ACTIVE'))) offline
  `))[0] ?? {unread:0,offline:0};
  const schools=rowsOf<{id:string;slug:string;name:string;timezone:string;branch_count:number;student_count:number;operational_access:boolean}>(await db.execute(sql`
    select school.id,school.slug,school.name,school.timezone,
      (select count(*)::int from school_branches b where b.school_id=school.id and b.status='ACTIVE') branch_count,
      (select count(*)::int from students s where s.school_id=school.id and s.status='ACTIVE') student_count,
      (${access.membership.role}='CASA_SUPER_ADMIN' or exists(select 1 from casa_internal_school_assignments a where a.membership_id=${access.membership.id}::uuid and a.school_id=school.id and a.status='ACTIVE')) operational_access
    from schools school where school.status='ACTIVE'::school_status order by school.created_at desc,school.name asc
  `));
  const totals=rowsOf<{branches:number;students:number}>(await db.execute(sql`select (select count(*)::int from school_branches where status='ACTIVE') branches,(select count(*)::int from students where status='ACTIVE') students`))[0];
  const teamResult=access.membership.role==="CASA_SUPER_ADMIN"?await db.execute(sql`select count(*)::int count from casa_internal_memberships where role='CASA_TEAM' and status='ACTIVE'`):null;
  const teamCount=teamResult?rowsOf<{count:number}>(teamResult)[0]?.count??0:null;
  return <InternalShell actorName={access.session.fullName} role={access.membership.role} active="overview">
    <header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10 lg:py-9"><div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between"><div><p className="casa-kicker text-black/45">CASA / Overview</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Platform control.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-black/50">Organization inventory and platform counts are universal to CASA Team. Operational access to an individual school remains assignment-scoped.</p></div>{access.membership.role==="CASA_SUPER_ADMIN"&&<Link href="/internal/schools?create=1" className="casa-button-primary shrink-0">Register new school</Link>}</div></header>
    <div className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <section className="grid border border-black sm:grid-cols-2 xl:grid-cols-4">{[["Organizations",schools.length],["Active branches",totals?.branches??0],["Students",totals?.students??0],["CASA Team",teamCount??"Scoped"]].map(([label,value])=><div key={String(label)} className="min-h-36 border-b border-r border-black/15 p-5 last:border-r-0 xl:border-b-0"><p className="casa-kicker text-black/40">{label}</p><p className="mt-8 text-4xl font-semibold tracking-[-0.06em]">{value}</p></div>)}</section>
      <Link href="/internal/notifications" className="mt-6 grid gap-3 border border-black bg-white p-5 transition hover:bg-[#f2f2ef] sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="casa-kicker text-black/40">Operational notifications</p><p className="mt-2 text-sm text-black/55">Scanner health transitions and other CASA operational events.</p></div><span className="text-sm"><strong>{health.unread}</strong> unread</span><span className="text-sm"><strong>{health.offline}</strong> scanner{health.offline===1?"":"s"} offline</span></Link>
      <section className="mt-8 border border-black bg-white"><div className="flex items-center justify-between gap-5 border-b border-black px-5 py-4"><div><p className="casa-kicker text-black/40">Schools</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">All registered organizations</h2></div><Link href="/internal/schools" className="text-sm underline underline-offset-4">View all</Link></div>
      {schools.length===0?<div className="p-8 sm:p-10"><p className="max-w-xl text-sm leading-6 text-black/50">No organization has been registered yet.</p>{access.membership.role==="CASA_SUPER_ADMIN"&&<Link href="/internal/schools?create=1" className="casa-button-primary mt-6 inline-flex">Register first school</Link>}</div>:<div>{schools.slice(0,8).map(s=>s.operational_access?<Link key={s.id} href={`/internal/schools/${s.id}`} className="grid gap-4 border-b border-black/15 px-5 py-5 transition last:border-b-0 hover:bg-[#f2f2ef] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><h3 className="text-lg font-semibold">{s.name}</h3><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-black/40">{s.slug} · Assigned</p></div><p className="text-sm text-black/50">{s.branch_count} branches</p><p className="text-sm text-black/50">{s.student_count} students</p></Link>:<div key={s.id} className="grid gap-4 border-b border-black/15 px-5 py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><h3 className="text-lg font-semibold">{s.name}</h3><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-black/40">{s.slug} · Not assigned</p></div><p className="text-sm text-black/50">{s.branch_count} branches</p><p className="text-sm text-black/50">{s.student_count} students</p></div>)}</div>}
      </section>
    </div>
  </InternalShell>;
}
