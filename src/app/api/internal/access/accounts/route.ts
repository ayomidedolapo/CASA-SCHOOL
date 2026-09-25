import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabaseUrl } from "@/config/env";
import { getDb } from "@/db";
import { normalizeLoginIdentifier } from "@/server/auth/identifier";
import { requireCasaSuperAdmin } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse, casaInternalNoStoreHeaders } from "@/server/internal/http";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";
import { sendAccountAccessEmail } from "@/server/messaging/account-access-email";
export const dynamic="force-dynamic";
const schema=z.object({fullName:z.string().trim().min(2).max(200),email:z.string().trim().email().max(320),role:z.enum(["CASA_SUPER_ADMIN","CASA_TEAM"])});
function rowsOf<T>(r:unknown):T[]{if(Array.isArray(r))return r as T[];if(r&&typeof r==="object"&&"rows" in r&&Array.isArray((r as {rows?:unknown}).rows))return (r as {rows:T[]}).rows;return []}
const tokenHash=(v:string)=>createHash("sha256").update(v).digest("hex");

export async function POST(request:NextRequest){
 try{
  const access=await requireCasaSuperAdmin();
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({message:"Check the CASA Team account fields."},{status:400,headers:casaInternalNoStoreHeaders});
  const identity=normalizeLoginIdentifier(parsed.data.email);
  if(!identity||identity.kind!=="EMAIL")return NextResponse.json({message:"Enter a valid email address."},{status:400,headers:casaInternalNoStoreHeaders});
  const db=getDb();
  const existing=rowsOf<{id:string;full_name:string;user_status:string;membership_id:string|null;has_password:boolean}>(await db.execute(sql`
   select u.id,u.full_name,u.status::text as user_status,m.id as membership_id,
   exists(select 1 from auth_password_credentials p where p.user_id=u.id) as has_password
   from users u left join casa_internal_memberships m on m.user_id=u.id where u.email=${identity.value} limit 1
  `))[0];
  if(existing?.membership_id)return NextResponse.json({message:"That email is already a CASA internal member. Manage the existing team record."},{status:409,headers:casaInternalNoStoreHeaders});
  if(existing&&existing.user_status!=="ACTIVE")return NextResponse.json({message:"That email belongs to an inactive CASA identity."},{status:409,headers:casaInternalNoStoreHeaders});
  const userId=existing?.id??randomUUID(),membershipId=randomUUID();
  const needsSetup=!existing||!existing.has_password;
  const rawToken=needsSetup?randomBytes(32).toString("base64url"):null;
  const hash=rawToken?tokenHash(rawToken):null;
  const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
  const client=neon(getDatabaseUrl());
  const statements=[];
  if(!existing)statements.push(client`insert into users(id,full_name,email,phone,status) values(${userId}::uuid,${parsed.data.fullName},${identity.value},null,'ACTIVE')`);
  statements.push(client`insert into casa_internal_memberships(id,user_id,role,status) values(${membershipId}::uuid,${userId}::uuid,${parsed.data.role},'ACTIVE')`);
  if(needsSetup){
    statements.push(client`update casa_account_setup_tokens set used_at=now() where user_id=${userId}::uuid and used_at is null`);
    statements.push(client`insert into casa_account_setup_tokens(user_id,token_hash,purpose,created_by_internal_membership_id,expires_at) values(${userId}::uuid,${hash},'CASA_INTERNAL',${access.membership.id}::uuid,${expiresAt}::timestamptz)`);
  }
  await client.transaction(statements);
  await writeCasaInternalAudit({access,action:"INTERNAL_ACCOUNT_CREATED",subjectType:"CASA_INTERNAL_MEMBERSHIP",subjectId:membershipId,metadata:{userId,role:parsed.data.role,existingIdentity:Boolean(existing),setupRequired:needsSetup}});
  const origin=new URL(request.url).origin;
  const setup=rawToken?{url:`${origin}/account/setup?token=${encodeURIComponent(rawToken)}`,expiresAt}:null;
  const emailDelivery=await sendAccountAccessEmail({email:identity.value,recipientName:existing?.full_name??parsed.data.fullName,organizationName:"CASA",actionLabel:setup?"Set up CASA Team access":"Sign in to CASA Platform Control",actionUrl:setup?.url??`${origin}/internal/login`,expiresAt:setup?.expiresAt??null,context:setup?"CASA created an internal Platform Control account for you. Use the private link below to choose your password.":"Your existing CASA identity has been granted Platform Control access."});
  return NextResponse.json({membership:{id:membershipId,userId,role:parsed.data.role,status:"ACTIVE",fullName:existing?.full_name??parsed.data.fullName,email:identity.value},existingIdentity:Boolean(existing),emailDelivery,setup},{status:201,headers:casaInternalNoStoreHeaders});
 }catch(error){const r=casaInternalAuthErrorResponse(error);if(r)return r;console.error("CASA internal account creation failed",error);return NextResponse.json({message:"CASA could not create this team account. No partial account should be used; try again after checking the server log."},{status:500,headers:casaInternalNoStoreHeaders})}
}
