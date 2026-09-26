import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { getDatabaseUrl } from "@/config/env";
import { requireCasaSuperAdmin } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse,casaInternalNoStoreHeaders } from "@/server/internal/http";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";

const schema=z.object({status:z.enum(["ACTIVE","SUSPENDED"]),confirm:z.literal(true)});
export async function PATCH(request:NextRequest,{params}:{params:Promise<{schoolId:string}>}){
 try{
  const access=await requireCasaSuperAdmin();const {schoolId}=await params;const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({message:"Explicit confirmation is required."},{status:400,headers:casaInternalNoStoreHeaders});
  const client=neon(getDatabaseUrl());
  if(parsed.data.status==="SUSPENDED"){
   await client.transaction([
    client`delete from casa_school_suspension_branch_state where school_id=${schoolId}::uuid`,
    client`insert into casa_school_suspension_branch_state(school_id,branch_id,was_active) select school_id,id,(status='ACTIVE') from school_branches where school_id=${schoolId}::uuid`,
    client`update school_branches set status='INACTIVE' where school_id=${schoolId}::uuid`,
    client`update schools set status='SUSPENDED'::school_status where id=${schoolId}::uuid`
   ]);
  }else{
   await client.transaction([
    client`update schools set status='ACTIVE'::school_status where id=${schoolId}::uuid`,
    client`update school_branches b set status=case when s.was_active then 'ACTIVE'::school_branch_status else 'INACTIVE'::school_branch_status end, updated_at=now() from casa_school_suspension_branch_state s where s.school_id=${schoolId}::uuid and s.branch_id=b.id`,
    client`delete from casa_school_suspension_branch_state where school_id=${schoolId}::uuid`
   ]);
  }
  await writeCasaInternalAudit({access,schoolId,action:parsed.data.status==="SUSPENDED"?"INTERNAL_SCHOOL_SUSPENDED":"INTERNAL_SCHOOL_REACTIVATED",subjectType:"SCHOOL",subjectId:schoolId,metadata:{cascadeBranches:true}});
  return NextResponse.json({updated:true,status:parsed.data.status},{headers:casaInternalNoStoreHeaders});
 }catch(error){const r=casaInternalAuthErrorResponse(error);if(r)return r;console.error("CASA organization status update failed",error);return NextResponse.json({message:"Organization status update failed."},{status:500,headers:casaInternalNoStoreHeaders})}
}
