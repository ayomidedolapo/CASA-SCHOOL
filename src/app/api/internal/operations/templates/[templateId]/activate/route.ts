import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { getDatabaseUrl } from "@/config/env";
import { getDb } from "@/db";
import { requireCasaCapability } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse,casaInternalNoStoreHeaders } from "@/server/internal/http";
function rowsOf<T>(r:unknown):T[]{if(Array.isArray(r))return r as T[];if(r&&typeof r==="object"&&"rows" in r&&Array.isArray((r as {rows?:unknown}).rows))return (r as {rows:T[]}).rows;return []}
export async function POST(_request:Request,{params}:{params:Promise<{templateId:string}>}){try{const access=await requireCasaCapability("MASTER_TEMPLATE_ADMIN");const {templateId}=await params;const db=getDb();const target=rowsOf<{school_id:string;status:string;version_label:string}>(await db.execute(sql`select school_id,status::text status,version_label from student_card_templates where id=${templateId}::uuid limit 1`))[0];if(!target)return NextResponse.json({message:"Template not found."},{status:404,headers:casaInternalNoStoreHeaders});if(target.status==="RETIRED")return NextResponse.json({message:"Retired template history cannot be reactivated. Edit the current design to publish a new revision."},{status:409,headers:casaInternalNoStoreHeaders});if(target.status==="ACTIVE")return NextResponse.json({activated:true,alreadyActive:true},{headers:casaInternalNoStoreHeaders});const client=neon(getDatabaseUrl());const metadata=JSON.stringify({versionLabel:target.version_label});await client.transaction([
 client`update student_card_templates set status='RETIRED',activated_at=coalesce(activated_at,now()),retired_at=now(),updated_at=now() where school_id=${target.school_id}::uuid and status='ACTIVE' and id<>${templateId}::uuid`,
 client`update student_card_templates set status='ACTIVE',activated_at=now(),retired_at=null,updated_at=now() where id=${templateId}::uuid and status='DRAFT'`,
 client`insert into casa_internal_audit_logs(actor_membership_id,school_id,action,subject_type,subject_id,metadata,created_at) values(${access.membership.id}::uuid,${target.school_id}::uuid,'MASTER_CARD_TEMPLATE_ACTIVATED','CARD_TEMPLATE',${templateId}::uuid,${metadata}::jsonb,now())`
]);return NextResponse.json({activated:true},{headers:casaInternalNoStoreHeaders})}catch(e){const r=casaInternalAuthErrorResponse(e);if(r)return r;console.error("Template activation failed",e);return NextResponse.json({message:"Template activation failed."},{status:500,headers:casaInternalNoStoreHeaders})}}
