import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { CasaInternalAccessDeniedError, CasaInternalCapabilityError, isAuthRequiredError, requireCasaCapability } from "@/server/internal/authorization";
import InternalShell from "../internal-shell";

function rowsOf<T>(result: unknown): T[] { if(Array.isArray(result)) return result as T[]; if(result&&typeof result==="object"&&"rows" in result&&Array.isArray((result as {rows?:unknown}).rows)) return (result as {rows:T[]}).rows; return []; }
function configured(name:string, minimum=1){const value=process.env[name]?.trim()??"";return value.length>=minimum;}

export default async function InternalSecurityPage(){
 let access:Awaited<ReturnType<typeof requireCasaCapability>>;
 try{access=await requireCasaCapability("IDENTITY_SECURITY_INVESTIGATION");}catch(error){if(isAuthRequiredError(error))redirect("/internal/login");if(error instanceof CasaInternalCapabilityError||error instanceof CasaInternalAccessDeniedError)redirect("/internal/operations?denied=security");throw error}
 const db=getDb();
 const summary=rowsOf<{active_profiles:number;revoked_profiles:number;created_liveness:number;completed_liveness:number;failed_liveness:number;pending_cleanup:number;active_passkeys:number;active_terminals:number}>(await db.execute(sql`
  select
   (select count(*)::int from student_biometric_profiles where status='ACTIVE'::student_biometric_profile_status) as active_profiles,
   (select count(*)::int from student_biometric_profiles where status='REVOKED'::student_biometric_profile_status) as revoked_profiles,
   (select count(*)::int from biometric_liveness_sessions where status='CREATED'::biometric_liveness_status) as created_liveness,
   (select count(*)::int from biometric_liveness_sessions where status='COMPLETED'::biometric_liveness_status) as completed_liveness,
   (select count(*)::int from biometric_liveness_sessions where status='FAILED'::biometric_liveness_status) as failed_liveness,
   (select count(*)::int from biometric_provider_cleanup_jobs where status='PENDING'::biometric_provider_cleanup_status) as pending_cleanup,
   (select count(*)::int from auth_passkeys where revoked_at is null) as active_passkeys,
   (select count(*)::int from attendance_terminals where status='ACTIVE'::attendance_terminal_status) as active_terminals
 `))[0]??{active_profiles:0,revoked_profiles:0,created_liveness:0,completed_liveness:0,failed_liveness:0,pending_cleanup:0,active_passkeys:0,active_terminals:0};
 const config=[
  ["Biometric provider mode",configured("CASA_BIOMETRIC_PROVIDER_MODE")],
  ["AWS runtime role",configured("AWS_ROLE_ARN")||process.env.VERCEL_ENV===undefined],
  ["Rekognition namespace",configured("CASA_AWS_REKOGNITION_COLLECTION_PREFIX")],
  ["Liveness stream role",configured("CASA_AWS_LIVENESS_STREAM_ROLE_ARN")],
  ["Auth security HMAC",configured("AUTH_SECURITY_HMAC_SECRET",32)],
 ] as const;
 return <InternalShell actorName={access.session.fullName} role={access.membership.role} active="operations">
  <header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10 lg:py-9"><p className="casa-kicker text-black/45">CASA / Operations / Identity & security</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Identity trust health.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-black/50">Read-only operational visibility. No face record, Passkey, terminal credential or cloud secret can be changed from this page.</p></header>
  <div className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8"><section className="grid border border-black bg-white sm:grid-cols-2 xl:grid-cols-4">{[["Active faces",summary.active_profiles],["Failed liveness",summary.failed_liveness],["Cleanup pending",summary.pending_cleanup],["Active Passkeys",summary.active_passkeys]].map(([l,v])=><div key={String(l)} className="border-b border-black/15 p-5 sm:border-r xl:border-b-0"><p className="casa-kicker text-black/40">{l}</p><p className="mt-7 text-4xl font-semibold tracking-[-0.06em]">{v}</p></div>)}</section>
  <section className="mt-8 grid gap-8 xl:grid-cols-2"><div className="border border-black bg-white"><div className="border-b border-black p-5"><p className="casa-kicker text-black/40">Runtime</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Trust pipeline</h2></div>{[["Liveness waiting",summary.created_liveness],["Liveness completed",summary.completed_liveness],["Faces revoked",summary.revoked_profiles],["Active scanners",summary.active_terminals]].map(([l,v])=><div key={String(l)} className="flex justify-between border-b border-black/15 px-5 py-4 last:border-b-0"><span className="text-sm text-black/55">{l}</span><strong>{v}</strong></div>)}</div>
  <div className="border border-black bg-white"><div className="border-b border-black p-5"><p className="casa-kicker text-black/40">Configuration</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Security readiness</h2><p className="mt-2 text-sm text-black/45">Presence only. Values are never displayed.</p></div>{config.map(([l,ok])=><div key={l} className="flex justify-between border-b border-black/15 px-5 py-4 last:border-b-0"><span className="text-sm text-black/55">{l}</span><span className={`font-mono text-[10px] uppercase tracking-[0.1em] ${ok?"text-green-700":"text-amber-700"}`}>{ok?"Configured":"Needs attention"}</span></div>)}</div></section></div>
 </InternalShell>;
}
