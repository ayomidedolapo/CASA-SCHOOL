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
const bodySchema=z.object({name:z.string().trim().min(2).max(200),slug:z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),timezone:z.string().trim().min(3).max(64).default("Africa/Lagos"),headquarters:z.object({name:z.string().trim().min(1).max(120),code:z.string().trim().toUpperCase().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/).max(32),address:z.string().trim().max(1000).nullable().optional()}),owner:z.object({fullName:z.string().trim().min(2).max(200),email:z.string().trim().email().max(320)})});
function rowsOf<T>(r:unknown):T[]{if(Array.isArray(r))return r as T[];if(r&&typeof r==="object"&&"rows" in r&&Array.isArray((r as {rows?:unknown}).rows))return (r as {rows:T[]}).rows;return []}
const tokenHash=(v:string)=>createHash("sha256").update(v).digest("hex");

export async function POST(request:NextRequest){
 try{
  const access=await requireCasaSuperAdmin();
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({message:"Check the school, headquarters, and owner fields.",issues:parsed.error.issues},{status:400,headers:casaInternalNoStoreHeaders});
  const identity=normalizeLoginIdentifier(parsed.data.owner.email);
  if(!identity||identity.kind!=="EMAIL")return NextResponse.json({message:"Enter a valid owner email."},{status:400,headers:casaInternalNoStoreHeaders});
  const db=getDb();
  if(rowsOf(await db.execute(sql`select id from schools where slug=${parsed.data.slug} limit 1`)).length)return NextResponse.json({message:"That school workspace slug is already in use."},{status:409,headers:casaInternalNoStoreHeaders});
  const user=rowsOf<{id:string;full_name:string;status:string;has_password:boolean}>(await db.execute(sql`
   select u.id,u.full_name,u.status::text as status,exists(select 1 from auth_password_credentials p where p.user_id=u.id) as has_password
   from users u where u.email=${identity.value} limit 1
  `))[0];
  if(user&&user.status!=="ACTIVE")return NextResponse.json({message:"The owner email belongs to an inactive CASA identity."},{status:409,headers:casaInternalNoStoreHeaders});
  const schoolId=randomUUID(),branchId=randomUUID(),userId=user?.id??randomUUID(),membershipId=randomUUID(),roleId=randomUUID();
  const needsSetup=!user||!user.has_password;
  const rawToken=needsSetup?randomBytes(32).toString("base64url"):null;
  const hash=rawToken?tokenHash(rawToken):null;
  const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
  const client=neon(getDatabaseUrl());const statements=[
   client`insert into schools(id,slug,name,status,timezone) values(${schoolId}::uuid,${parsed.data.slug},${parsed.data.name},'ACTIVE',${parsed.data.timezone})`,
   client`insert into school_branches(id,school_id,name,code,is_headquarters,status,address) values(${branchId}::uuid,${schoolId}::uuid,${parsed.data.headquarters.name},${parsed.data.headquarters.code},true,'ACTIVE',${parsed.data.headquarters.address??null})`
  ];
  if(!user)statements.push(client`insert into users(id,full_name,email,phone,status) values(${userId}::uuid,${parsed.data.owner.fullName},${identity.value},null,'ACTIVE')`);
  statements.push(client`insert into school_memberships(id,school_id,user_id,status,joined_at) values(${membershipId}::uuid,${schoolId}::uuid,${userId}::uuid,'ACTIVE',now())`);
  statements.push(client`insert into school_membership_roles(id,school_id,membership_id,role) values(${roleId}::uuid,${schoolId}::uuid,${membershipId}::uuid,'OWNER')`);
  if(needsSetup){
   statements.push(client`update casa_account_setup_tokens set used_at=now() where user_id=${userId}::uuid and used_at is null`);
   statements.push(client`insert into casa_account_setup_tokens(user_id,token_hash,purpose,created_by_internal_membership_id,expires_at) values(${userId}::uuid,${hash},'SCHOOL_OWNER',${access.membership.id}::uuid,${expiresAt}::timestamptz)`);
  }
  await client.transaction(statements);
  await writeCasaInternalAudit({access,schoolId,action:"INTERNAL_SCHOOL_REGISTERED",subjectType:"SCHOOL",subjectId:schoolId,metadata:{slug:parsed.data.slug,headquartersId:branchId,ownerUserId:userId,ownerExistingIdentity:Boolean(user),ownerSetupRequired:needsSetup}});
  const origin=new URL(request.url).origin;
  const setup=rawToken?{url:`${origin}/account/setup?token=${encodeURIComponent(rawToken)}`,expiresAt}:null;
  const emailDelivery=await sendAccountAccessEmail({
   email:identity.value,
   recipientName:user?.full_name??parsed.data.owner.fullName,
   organizationName:parsed.data.name,
   actionLabel:setup?"Set up School Owner access":"Sign in to CASA",
   actionUrl:setup?.url??`${origin}/login?school=${encodeURIComponent(parsed.data.slug)}`,
   expiresAt:setup?.expiresAt??null,
   context:setup
    ?`${parsed.data.name} has been registered on CASA. Use this private link to set up your School Owner account.`
    :`${parsed.data.name} has been registered on CASA and your existing CASA identity has been granted School Owner access.`
  });
  return NextResponse.json({school:{id:schoolId,slug:parsed.data.slug,name:parsed.data.name},headquarters:{id:branchId,name:parsed.data.headquarters.name,code:parsed.data.headquarters.code},emailDelivery,owner:{userId,fullName:user?.full_name??parsed.data.owner.fullName,email:identity.value,existingIdentity:Boolean(user),setup}},{status:201,headers:casaInternalNoStoreHeaders});
 }catch(error){const response=casaInternalAuthErrorResponse(error);if(response)return response;console.error("CASA school registration failed",error);return NextResponse.json({message:"CASA could not register this school. The request was not accepted as a completed school registration."},{status:500,headers:casaInternalNoStoreHeaders})}
}
