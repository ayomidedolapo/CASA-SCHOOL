import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { CasaInternalAccessDeniedError, CasaInternalCapabilityError, isAuthRequiredError, requireCasaCapability } from "@/server/internal/authorization";
import InternalShell from "../internal-shell";

function rowsOf<T>(result: unknown): T[] { if(Array.isArray(result))return result as T[];if(result&&typeof result==="object"&&"rows" in result&&Array.isArray((result as {rows?:unknown}).rows))return (result as {rows:T[]}).rows;return [];}
function configured(name:string,min=1){return (process.env[name]?.trim().length??0)>=min;}

export default async function InternalPlatformPage(){
 let access:Awaited<ReturnType<typeof requireCasaCapability>>;
 try{access=await requireCasaCapability("PLATFORM_CONFIGURATION");}catch(error){if(isAuthRequiredError(error))redirect("/internal/login");if(error instanceof CasaInternalCapabilityError||error instanceof CasaInternalAccessDeniedError)redirect("/internal/operations?denied=platform");throw error}
 const db=getDb();
 const counts=rowsOf<{migrations:number;schools:number;branches:number;super_admins:number;team:number}>(await db.execute(sql`select (select count(*)::int from drizzle.__drizzle_migrations) as migrations,(select count(*)::int from schools where status='ACTIVE'::school_status) as schools,(select count(*)::int from school_branches where status='ACTIVE') as branches,(select count(*)::int from casa_internal_memberships where role='CASA_SUPER_ADMIN' and status='ACTIVE') as super_admins,(select count(*)::int from casa_internal_memberships where role='CASA_TEAM' and status='ACTIVE') as team`))[0]??{migrations:0,schools:0,branches:0,super_admins:0,team:0};
 const deployment=process.env.VERCEL_ENV??(process.env.NODE_ENV==="production"?"production runtime":"local development");
 const checks=[
  ["Database schema",counts.migrations===31?"31 migrations":"Review migration state",counts.migrations===31],
  ["Authentication HMAC",configured("AUTH_SECURITY_HMAC_SECRET",32)?"Configured":"Missing / invalid",configured("AUTH_SECURITY_HMAC_SECRET",32)],
  ["Card object storage",configured("CASA_CARD_STORAGE_BUCKET")?"Configured":"Needs attention",configured("CASA_CARD_STORAGE_BUCKET")],
  ["Card storage region",configured("CASA_CARD_STORAGE_REGION")?"Configured":"Needs attention",configured("CASA_CARD_STORAGE_REGION")],
  ["Rekognition namespace",configured("CASA_AWS_REKOGNITION_COLLECTION_PREFIX")?"Configured":"Needs attention",configured("CASA_AWS_REKOGNITION_COLLECTION_PREFIX")],
  ["Liveness streaming",configured("CASA_AWS_LIVENESS_STREAM_ROLE_ARN")?"Configured":"Needs attention",configured("CASA_AWS_LIVENESS_STREAM_ROLE_ARN")],
 ] as const;
 return <InternalShell actorName={access.session.fullName} role={access.membership.role} active="operations">
  <header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10 lg:py-9"><p className="casa-kicker text-black/45">CASA / Operations / Platform</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Platform status.</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-black/50">Deployment configuration stays outside the browser. This page reports readiness only; it never displays or edits secret values.</p></header>
  <div className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8"><section className="grid border border-black bg-white sm:grid-cols-2 xl:grid-cols-5">{[["Organizations",counts.schools],["Branches",counts.branches],["Super Admins",counts.super_admins],["CASA Team",counts.team],["Migrations",counts.migrations]].map(([l,v])=><div key={String(l)} className="border-b border-black/15 p-5 sm:border-r xl:border-b-0"><p className="casa-kicker text-black/40">{l}</p><p className="mt-7 text-4xl font-semibold tracking-[-0.06em]">{v}</p></div>)}</section>
  <section className="mt-8 border border-black bg-white"><div className="border-b border-black p-5"><p className="casa-kicker text-black/40">Runtime</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Configuration readiness</h2><p className="mt-2 text-sm text-black/45">Environment: {deployment}. Secret values remain hidden.</p></div>{checks.map(([l,text,ok])=><div key={l} className="grid gap-2 border-b border-black/15 px-5 py-4 last:border-b-0 sm:grid-cols-[1fr_auto]"><span className="text-sm text-black/55">{l}</span><span className={`font-mono text-[10px] uppercase tracking-[0.1em] ${ok?"text-green-700":"text-amber-700"}`}>{text}</span></div>)}</section></div>
 </InternalShell>;
}
