import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { CasaInternalAccessDeniedError,isAuthRequiredError,requireCasaSuperAdmin } from "@/server/internal/authorization";
import InternalShell from "../internal-shell";
function rowsOf<T>(r:unknown):T[]{if(Array.isArray(r))return r as T[];if(r&&typeof r==="object"&&"rows" in r&&Array.isArray((r as {rows?:unknown}).rows))return (r as {rows:T[]}).rows;return []}
export default async function Page(){let access;try{access=await requireCasaSuperAdmin()}catch(e){if(isAuthRequiredError(e))redirect("/internal/login");if(e instanceof CasaInternalAccessDeniedError)redirect("/internal");throw e}const db=getDb();let database="HEALTHY";let schoolStats:{active:number;suspended:number}={active:0,suspended:0};let terminals:{active:number;seen_recently:number}={active:0,seen_recently:0};try{const r=rowsOf<{active:number;suspended:number;terminals:number;recent:number}>(await db.execute(sql`select (select count(*)::int from schools where status='ACTIVE') active,(select count(*)::int from schools where status='SUSPENDED') suspended,(select count(*)::int from attendance_terminals where status='ACTIVE') terminals,(select count(*)::int from attendance_terminals where status='ACTIVE' and last_seen_at>now()-interval '5 minutes') recent`))[0];schoolStats={active:r?.active??0,suspended:r?.suspended??0};terminals={active:r?.terminals??0,seen_recently:r?.recent??0}}catch{database="UNAVAILABLE"}
const validBasisPoints=(value:string|undefined)=>{if(!value)return false;const parsed=Number(value);return Number.isInteger(parsed)&&parsed>=0&&parsed<=10000};
const validQualityFilter=new Set(["NONE","AUTO","LOW","MEDIUM","HIGH"]).has((process.env.CASA_AWS_REKOGNITION_QUALITY_FILTER??"").trim().toUpperCase());
const biometricRuntimeRequirements:Array<[string,boolean]>=[
 ["provider mode",process.env.CASA_BIOMETRIC_PROVIDER_MODE==="AWS_REKOGNITION"],
 ["hosted AWS identity",Boolean(process.env.AWS_ROLE_ARN)],
 ["Rekognition region",Boolean(process.env.CASA_AWS_REKOGNITION_REGION)],
 ["Rekognition collection",Boolean(process.env.CASA_AWS_REKOGNITION_COLLECTION_PREFIX)],
 ["liveness streaming role",Boolean(process.env.CASA_AWS_LIVENESS_STREAM_ROLE_ARN)],
 ["quality filter",validQualityFilter],
 ["face threshold",validBasisPoints(process.env.CASA_BIOMETRIC_FACE_MIN_CONFIDENCE_BPS)],
 ["liveness threshold",validBasisPoints(process.env.CASA_BIOMETRIC_LIVENESS_MIN_CONFIDENCE_BPS)],
 ["assertion signing",Boolean(process.env.CASA_BIOMETRIC_ASSERTION_HMAC_SECRET)]
];
const missingBiometricRuntime=biometricRuntimeRequirements.filter(([,ready])=>!ready).map(([name])=>name);
const biometricRuntimeReady=missingBiometricRuntime.length===0;
const checks=[
 ["Application","HEALTHY","This server rendered the control plane successfully."],
 ["Database",database,`Query healthy · ${schoolStats.active} active schools · ${schoolStats.suspended} suspended`],
 ["Card storage",process.env.CASA_CARD_STORAGE_BUCKET?"CONFIGURED":"NOT CONFIGURED",process.env.CASA_CARD_STORAGE_BUCKET?"Storage bucket configured; secret values hidden.":"Card storage bucket is not configured."],
 ["AWS biometric configuration",biometricRuntimeReady?"CONFIG COMPLETE":"NOT READY",biometricRuntimeReady?"All CASA biometric policy, AWS identity, Rekognition, liveness-role and assertion-signing settings are present and valid. This is configuration readiness; the live capture remains the end-to-end AWS runtime proof.":`Incomplete biometric runtime: ${missingBiometricRuntime.join(", ")}. Secret values remain hidden.`],
["Hosted AWS identity",process.env.AWS_ROLE_ARN?"CONFIG PRESENT":"LOCAL/DEFAULT",process.env.AWS_ROLE_ARN?"Hosted role binding is present; ARN hidden. This card does not claim that AWS authorization has succeeded.":"Using non-hosted/default credential path or not configured."],
 ["Scanner terminals",terminals.active===0?"NO ACTIVE TERMINALS":terminals.seen_recently===terminals.active?"HEALTHY":"ATTENTION",`${terminals.seen_recently}/${terminals.active} active terminals seen in the last 5 minutes.`],
 ["Card production",process.env.CASA_CARD_STORAGE_BUCKET?"READY TO CHECK":"BLOCKED",process.env.CASA_CARD_STORAGE_BUCKET?"Storage foundation configured. Production queue status is available in Operations.":"Configure card storage before production."]
];
return <InternalShell actorName={access.session.fullName} role={access.membership.role} active="health"><header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10"><p className="casa-kicker text-black/45">CASA / System health</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Platform movement.</h1><p className="mt-4 max-w-3xl text-sm leading-6 text-black/50">A read-only control view from application to database, cloud services, terminals and organizations. Credentials and secret values are never rendered.</p></header><div className="grid gap-4 px-5 py-6 sm:px-8 lg:grid-cols-2 lg:px-10">{checks.map(([name,status,detail])=><section key={name} className="border border-black bg-white p-5"><div className="flex items-center justify-between gap-4"><h2 className="font-semibold">{name}</h2><span className="font-mono text-[9px] uppercase tracking-[0.12em]">{status}</span></div><p className="mt-4 text-sm leading-6 text-black/50">{detail}</p></section>)}</div></InternalShell>}
