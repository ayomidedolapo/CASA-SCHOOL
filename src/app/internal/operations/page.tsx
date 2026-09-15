import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { CasaInternalAccessDeniedError, isAuthRequiredError, requireCasaInternalAccess } from "@/server/internal/authorization";
import InternalShell from "../internal-shell";

function rowsOf<T>(result: unknown): T[] { if (Array.isArray(result)) return result as T[]; if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows?: unknown }).rows)) return (result as { rows: T[] }).rows; return []; }

type Module = {title:string;label:string;description:string;href:string;capability:string|null;superOnly?:boolean};
const modules: Module[] = [
  {title:"Organizations",label:"Schools",description:"See every registered organization and platform-wide counts. Every active CASA Team member can open active schools for onboarding.",href:"/internal/schools",capability:null},
  {title:"Student onboarding",label:"Implementation",description:"Continue student, guardian, enrollment, identity and rollout work across every active CASA school.",href:"/internal/onboarding",capability:null},
  {title:"Card production",label:"Production",description:"Operate central card jobs, filter by branch, preview outputs and export XLSX manifests.",href:"/internal/card-production",capability:"CARD_PRODUCTION_ADMIN"},
  {title:"Card templates",label:"Design control",description:"Create, revise, activate and safely retire school-owned CASA card designs.",href:"/internal/templates",capability:"MASTER_TEMPLATE_ADMIN"},
  {title:"Security & Passkeys",label:"Account security",description:"Register or add Passkeys for this account. Password remains an available fallback where the role supports it.",href:"/security/passkeys",capability:null},
  {title:"Audit & compliance",label:"Audit",description:"Read internal operational and security actions with actor, subject and timestamp context.",href:"/internal/audit",capability:"AUDIT_READ"},
  {title:"Organization structure",label:"Structure",description:"Review branch and headquarters structure before controlled restructuring work.",href:"/internal/structure",capability:"ORGANIZATION_RESTRUCTURE"},
  {title:"Identity security",label:"Security",description:"Investigate identity and security conditions when this CASA account is explicitly authorized.",href:"/internal/security",capability:"IDENTITY_SECURITY_INVESTIGATION"},
  {title:"Platform configuration",label:"Configuration",description:"Platform-level configuration controls for authorized CASA operators.",href:"/internal/platform",capability:"PLATFORM_CONFIGURATION"},
  {title:"Finance",label:"Term + session",description:"Pricing and estimated financial performance. Restricted to CASA Super Admin.",href:"/internal/finance",capability:null,superOnly:true},
  {title:"System health",label:"Platform",description:"Read database, cloud, terminal and platform readiness. Restricted to CASA Super Admin.",href:"/internal/health",capability:null,superOnly:true},
];

export default async function InternalOperationsPage({searchParams}:{searchParams:Promise<{denied?:string}>}) {
  let access: Awaited<ReturnType<typeof requireCasaInternalAccess>>;
  try { access = await requireCasaInternalAccess(); } catch (error) { if (isAuthRequiredError(error)) redirect("/internal/login"); if (error instanceof CasaInternalAccessDeniedError) redirect("/internal/login?denied=1"); throw error; }
  const db=getDb();
  const stats=rowsOf<{schools:number;students:number;ready_cards:number;active_cards:number;production_ready:number}>(await db.execute(sql`select (select count(*)::int from schools) schools,(select count(*)::int from students) students,(select count(*)::int from student_identity_cards where status='READY_FOR_ACTIVATION') ready_cards,(select count(*)::int from student_identity_cards where status='ACTIVE') active_cards,(select count(*)::int from student_card_production_jobs where status='READY') production_ready`))[0];
  const granted=new Set<string>();
  if(access.membership.role!=="CASA_SUPER_ADMIN"){for(const row of rowsOf<{capability:string}>(await db.execute(sql`select capability::text capability from casa_internal_capability_grants where membership_id=${access.membership.id}::uuid and revoked_at is null`)))granted.add(row.capability)}
  const params=await searchParams;
  const visible=modules.filter((module)=>{if(module.superOnly)return access.membership.role==="CASA_SUPER_ADMIN";if(!module.capability)return true;return access.membership.role==="CASA_SUPER_ADMIN"||granted.has(module.capability)});
  return <InternalShell actorName={access.session.fullName} role={access.membership.role} active="operations"><header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10"><p className="casa-kicker text-black/45">CASA / Operations</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Your authorized control room.</h1><p className="mt-4 max-w-3xl text-sm leading-6 text-black/50">Platform totals are universal. Sensitive operational modules appear only when your CASA role or capability permits them.</p></header><div className="px-5 py-6 sm:px-8 lg:px-10">{params.denied&&<div className="mb-6 border-l-2 border-[#a12620] bg-[#f6e8e6] px-4 py-3 text-sm text-[#7e1d18]">That module is not assigned to this CASA account. Ask a Super Admin to grant the required capability if you need it.</div>}<section className="grid gap-4 md:grid-cols-5">{[["Schools",stats?.schools??0],["Students",stats?.students??0],["Awaiting card activation",stats?.ready_cards??0],["Active cards",stats?.active_cards??0],["Cards ready to print",stats?.production_ready??0]].map(([l,v])=><div key={String(l)} className="border border-black bg-white p-4"><p className="casa-kicker text-black/40">{l}</p><p className="mt-3 text-3xl font-semibold">{v}</p></div>)}</section><section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((m)=><Link key={m.title} href={m.href} className="border border-black bg-white p-5 hover:bg-black hover:text-white"><p className="font-mono text-[9px] uppercase tracking-[0.12em] opacity-50">{m.label}</p><h2 className="mt-3 text-xl font-semibold">{m.title}</h2><p className="mt-3 text-sm leading-6 opacity-60">{m.description}</p></Link>)}</section></div></InternalShell>;
}
