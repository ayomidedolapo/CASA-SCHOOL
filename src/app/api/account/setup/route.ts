import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { hashPassword } from "@/server/auth/password";

export const dynamic = "force-dynamic";
const noStore = {"Cache-Control":"no-store"};
const tokenSchema=z.string().min(32).max(512);
const postSchema=z.object({token:tokenSchema,password:z.string().min(12).max(128)});

function hashToken(value:string){return createHash("sha256").update(value).digest("hex")}
function rowsOf<T>(r:unknown):T[]{if(Array.isArray(r))return r as T[];if(r&&typeof r==="object"&&"rows" in r&&Array.isArray((r as {rows?:unknown}).rows))return (r as {rows:T[]}).rows;return []}

export async function GET(request:NextRequest){
  const raw=new URL(request.url).searchParams.get("token");
  const parsed=tokenSchema.safeParse(raw);
  if(!parsed.success)return NextResponse.json({valid:false,message:"This account setup link is invalid."},{status:400,headers:noStore});
  const db=getDb();
  const row=rowsOf<{full_name:string;email:string|null;purpose:string;expires_at:Date}>(await db.execute(sql`
    select u.full_name,u.email,t.purpose,t.expires_at
    from casa_account_setup_tokens t join users u on u.id=t.user_id
    where t.token_hash=${hashToken(parsed.data)} and t.used_at is null and t.expires_at>now() and u.status='ACTIVE'::user_status
    limit 1
  `))[0];
  if(!row)return NextResponse.json({valid:false,message:"This account setup link has expired or has already been used."},{status:410,headers:noStore});
  return NextResponse.json({valid:true,account:{fullName:row.full_name,email:row.email,purpose:row.purpose,expiresAt:row.expires_at}},{headers:noStore});
}

export async function POST(request:NextRequest){
  const parsed=postSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({message:"Use a password between 12 and 128 characters."},{status:400,headers:noStore});
  const tokenHash=hashToken(parsed.data.token);
  const passwordHash=await hashPassword(parsed.data.password);
  const db=getDb();
  const result=await db.execute(sql`
    with consumed as (
      update casa_account_setup_tokens
      set used_at=now()
      where token_hash=${tokenHash} and used_at is null and expires_at>now()
      returning user_id,purpose
    ),
    credential as (
      insert into auth_password_credentials(user_id,password_hash,must_change_password)
      select user_id,${passwordHash},false from consumed
      on conflict(user_id) do update set password_hash=excluded.password_hash,must_change_password=false
      returning user_id
    )
    select c.user_id,c.purpose from consumed c where exists(select 1 from credential)
  `);
  const row=rowsOf<{user_id:string;purpose:string}>(result)[0];
  if(!row)return NextResponse.json({message:"This account setup link has expired or has already been used."},{status:410,headers:noStore});
  return NextResponse.json({configured:true,nextPath:row.purpose==="CASA_INTERNAL"?"/internal/login":"/login"},{headers:noStore});
}
