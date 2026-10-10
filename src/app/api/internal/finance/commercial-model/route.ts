import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { requireCasaSuperAdmin } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse, casaInternalNoStoreHeaders } from "@/server/internal/http";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";

export const dynamic = "force-dynamic";
const dateString=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money=z.number().min(0).max(1000000000);
const agreement=z.object({
  schoolId:z.string().uuid(),serviceSessionLabel:z.string().trim().max(160).nullable().optional(),
  startsOn:dateString,endsOn:dateString,studentCount:z.number().int().min(0).max(1000000),
  baseSessionFeeNaira:money,studentRateNaira:money,cardServiceFeeNaira:money,
  agreedTotalNaira:z.number().positive().max(1000000000),paymentPlan:z.enum(["FULL","TWO_INSTALLMENTS"]),
  firstInstallmentNaira:z.number().positive().max(1000000000),firstDueOn:dateString,
  secondInstallmentNaira:z.number().positive().max(1000000000).nullable().optional(),secondDueOn:dateString.nullable().optional(),
  agreementNote:z.string().trim().max(4000).nullable().optional(),
});
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("UPDATE_DEFAULTS"),baseSessionFeeNaira:money,studentRateNaira:money,cardServiceFeeNaira:money}),
  agreement.extend({action:z.literal("SAVE_AGREEMENT"),agreementId:z.string().uuid().nullable().optional()}),
  z.object({action:z.literal("MARK_AGREED"),agreementId:z.string().uuid()}),
  z.object({action:z.literal("CANCEL_AGREEMENT"),agreementId:z.string().uuid()}),
]);
function rowsOf<T>(v:unknown):T[]{if(Array.isArray(v))return v as T[];if(v&&typeof v==="object"&&"rows" in v&&Array.isArray((v as {rows?:unknown}).rows))return (v as {rows:T[]}).rows;return []}
const kobo=(v:number)=>Math.round(v*100);

export async function GET(){
 try{
  await requireCasaSuperAdmin(); const db=getDb();
  const [d,s,a]=await Promise.all([
   db.execute(sql`select base_session_fee_kobo,student_rate_kobo,card_service_fee_kobo,updated_at from casa_finance_commercial_defaults where id=1 limit 1`),
   db.execute(sql`select school.id,school.name,school.slug,count(student.id) filter(where student.status='ACTIVE'::student_status)::int as active_student_count from schools school left join students student on student.school_id=school.id where school.status='ACTIVE'::school_status group by school.id,school.name,school.slug order by school.name`),
   db.execute(sql`select agreement.id,agreement.school_id,school.name as school_name,agreement.status,agreement.service_session_label,agreement.starts_on::text as starts_on,agreement.ends_on::text as ends_on,agreement.student_count,agreement.base_session_fee_kobo,agreement.student_rate_kobo,agreement.student_component_kobo,agreement.card_service_fee_kobo,agreement.calculated_total_kobo,agreement.agreed_total_kobo,agreement.payment_plan,agreement.first_installment_kobo,agreement.first_due_on::text as first_due_on,agreement.second_installment_kobo,agreement.second_due_on::text as second_due_on,agreement.agreement_note,agreement.agreed_at from casa_finance_session_agreements agreement join schools school on school.id=agreement.school_id order by agreement.created_at desc limit 200`)
  ]);
  const x=rowsOf<{base_session_fee_kobo:string|number;student_rate_kobo:string|number;card_service_fee_kobo:string|number;updated_at:string|Date}>(d)[0];
  return NextResponse.json({defaults:{baseSessionFeeNaira:Number(x?.base_session_fee_kobo??55000000)/100,studentRateNaira:Number(x?.student_rate_kobo??200000)/100,cardServiceFeeNaira:Number(x?.card_service_fee_kobo??3000000)/100,updatedAt:x?.updated_at??null},schools:rowsOf(s),agreements:rowsOf(a)},{headers:casaInternalNoStoreHeaders});
 }catch(error){const response=casaInternalAuthErrorResponse(error);if(response)return response;console.error("CASA commercial model read failed",error);return NextResponse.json({message:"CASA could not load the session commercial model."},{status:500,headers:casaInternalNoStoreHeaders})}
}

export async function POST(request:NextRequest){
 try{
  const access=await requireCasaSuperAdmin(); const parsed=schema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({message:"Check the session commercial fields.",issues:parsed.error.issues},{status:400,headers:casaInternalNoStoreHeaders});
  const input=parsed.data; const db=getDb();
  if(input.action==="UPDATE_DEFAULTS"){
   const b=kobo(input.baseSessionFeeNaira),s=kobo(input.studentRateNaira),c=kobo(input.cardServiceFeeNaira);
   await db.execute(sql`insert into casa_finance_commercial_defaults(id,base_session_fee_kobo,student_rate_kobo,card_service_fee_kobo,updated_by_internal_membership_id,created_at,updated_at) values(1,${b},${s},${c},${access.membership.id}::uuid,now(),now()) on conflict(id) do update set base_session_fee_kobo=excluded.base_session_fee_kobo,student_rate_kobo=excluded.student_rate_kobo,card_service_fee_kobo=excluded.card_service_fee_kobo,updated_by_internal_membership_id=excluded.updated_by_internal_membership_id,updated_at=now()`);
   await writeCasaInternalAudit({access,schoolId:null,action:"FINANCE_COMMERCIAL_DEFAULTS_UPDATED",subjectType:"FINANCE_COMMERCIAL_DEFAULTS",subjectId:null,metadata:{baseSessionFeeKobo:b,studentRateKobo:s,cardServiceFeeKobo:c}});
   return NextResponse.json({updated:true},{headers:casaInternalNoStoreHeaders});
  }
  if(input.action==="MARK_AGREED"||input.action==="CANCEL_AGREEMENT"){
   const target=input.action==="MARK_AGREED"?"AGREED":"CANCELLED";
   const r=rowsOf<{school_id:string}>(await db.execute(sql`update casa_finance_session_agreements set status=${target},agreed_at=case when ${target}='AGREED' then now() else agreed_at end,updated_by_internal_membership_id=${access.membership.id}::uuid,updated_at=now() where id=${input.agreementId}::uuid and status in ('DRAFT','AGREED') returning school_id::text as school_id`))[0];
   if(!r)return NextResponse.json({message:"This session agreement can no longer be changed from this action."},{status:409,headers:casaInternalNoStoreHeaders});
   await writeCasaInternalAudit({access,schoolId:r.school_id,action:input.action==="MARK_AGREED"?"FINANCE_SESSION_AGREEMENT_CONFIRMED":"FINANCE_SESSION_AGREEMENT_CANCELLED",subjectType:"FINANCE_SESSION_AGREEMENT",subjectId:input.agreementId,metadata:{}});
   return NextResponse.json({updated:true},{headers:casaInternalNoStoreHeaders});
  }
  if(input.endsOn<input.startsOn)return NextResponse.json({message:"The CASA service-session end date cannot be before its start date."},{status:400,headers:casaInternalNoStoreHeaders});
  const exists=rowsOf(await db.execute(sql`select 1 from schools where id=${input.schoolId}::uuid and status='ACTIVE'::school_status limit 1`)).length===1;
  if(!exists)return NextResponse.json({message:"The selected school is not available."},{status:404,headers:casaInternalNoStoreHeaders});
  const b=kobo(input.baseSessionFeeNaira),r=kobo(input.studentRateNaira),sc=input.studentCount*r,c=kobo(input.cardServiceFeeNaira),calc=b+sc+c,agreed=kobo(input.agreedTotalNaira),first=kobo(input.firstInstallmentNaira),second=input.secondInstallmentNaira==null?null:kobo(input.secondInstallmentNaira);
  if(input.paymentPlan==="FULL"&&(first!==agreed||input.secondInstallmentNaira!=null||input.secondDueOn!=null))return NextResponse.json({message:"Full payment must equal the agreed session total and must not include a second installment."},{status:400,headers:casaInternalNoStoreHeaders});
  if(input.paymentPlan==="TWO_INSTALLMENTS"&&(second==null||!input.secondDueOn||first+second!==agreed||input.secondDueOn<input.firstDueOn))return NextResponse.json({message:"The two agreed installments must add up exactly to the agreed session total and use valid due dates."},{status:400,headers:casaInternalNoStoreHeaders});
  const values={label:input.serviceSessionLabel?.trim()||null,note:input.agreementNote?.trim()||null,secondDue:input.secondDueOn??null};
  if(input.agreementId){
   const row=rowsOf<{id:string}>(await db.execute(sql`update casa_finance_session_agreements set service_session_label=${values.label},starts_on=${input.startsOn}::date,ends_on=${input.endsOn}::date,student_count=${input.studentCount},base_session_fee_kobo=${b},student_rate_kobo=${r},student_component_kobo=${sc},card_service_fee_kobo=${c},calculated_total_kobo=${calc},agreed_total_kobo=${agreed},payment_plan=${input.paymentPlan},first_installment_kobo=${first},first_due_on=${input.firstDueOn}::date,second_installment_kobo=${second},second_due_on=${values.secondDue}::date,agreement_note=${values.note},updated_by_internal_membership_id=${access.membership.id}::uuid,updated_at=now() where id=${input.agreementId}::uuid and school_id=${input.schoolId}::uuid and status='DRAFT' returning id::text as id`))[0];
   if(!row)return NextResponse.json({message:"Only a draft session agreement can be edited."},{status:409,headers:casaInternalNoStoreHeaders});
   return NextResponse.json({saved:true,agreementId:row.id},{headers:casaInternalNoStoreHeaders});
  }
  const created=rowsOf<{id:string}>(await db.execute(sql`insert into casa_finance_session_agreements(school_id,status,service_session_label,starts_on,ends_on,student_count,base_session_fee_kobo,student_rate_kobo,student_component_kobo,card_service_fee_kobo,calculated_total_kobo,agreed_total_kobo,payment_plan,first_installment_kobo,first_due_on,second_installment_kobo,second_due_on,agreement_note,created_by_internal_membership_id,updated_by_internal_membership_id) values(${input.schoolId}::uuid,'DRAFT',${values.label},${input.startsOn}::date,${input.endsOn}::date,${input.studentCount},${b},${r},${sc},${c},${calc},${agreed},${input.paymentPlan},${first},${input.firstDueOn}::date,${second},${values.secondDue}::date,${values.note},${access.membership.id}::uuid,${access.membership.id}::uuid) returning id::text as id`))[0];
  if(!created)throw new Error("SESSION_AGREEMENT_INSERT_FAILED");
  await writeCasaInternalAudit({access,schoolId:input.schoolId,action:"FINANCE_SESSION_AGREEMENT_DRAFTED",subjectType:"FINANCE_SESSION_AGREEMENT",subjectId:created.id,metadata:{studentCount:input.studentCount,calculatedTotalKobo:calc,agreedTotalKobo:agreed,paymentPlan:input.paymentPlan}});
  return NextResponse.json({saved:true,agreementId:created.id},{status:201,headers:casaInternalNoStoreHeaders});
 }catch(error){const response=casaInternalAuthErrorResponse(error);if(response)return response;console.error("CASA session commercial operation failed",error);return NextResponse.json({message:"CASA could not complete the session commercial operation."},{status:500,headers:casaInternalNoStoreHeaders})}
}
