import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { markProductionJobPrinted, rotateProductionPublicLink } from "@/server/card-production/production";
import { requireCasaCapability } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse, casaInternalNoStoreHeaders } from "@/server/internal/http";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";

export const dynamic="force-dynamic";
type Context={params:Promise<{jobId:string}>};
const bodySchema=z.object({action:z.enum(["MARK_PRINTED","ROTATE_PUBLIC_LINK"]),reason:z.string().trim().min(3).max(240).nullable().optional()});

export async function PATCH(request:NextRequest,context:Context){
 try{
  const access=await requireCasaCapability("CARD_PRODUCTION_ADMIN");
  const {jobId}=await context.params;
  if(!z.string().uuid().safeParse(jobId).success)return NextResponse.json({message:"Invalid production job ID."},{status:400,headers:casaInternalNoStoreHeaders});
  const body=bodySchema.safeParse(await request.json().catch(()=>null));
  if(!body.success)return NextResponse.json({message:"Invalid card production action."},{status:400,headers:casaInternalNoStoreHeaders});
  if(body.data.action==="ROTATE_PUBLIC_LINK"&&!body.data.reason)return NextResponse.json({message:"A reason is required to rotate a public card link."},{status:400,headers:casaInternalNoStoreHeaders});
  const result=body.data.action==="MARK_PRINTED"?await markProductionJobPrinted({jobId,reason:body.data.reason??null}):await rotateProductionPublicLink({jobId,reason:body.data.reason??null,origin:request.nextUrl.origin});
  if(!result)return NextResponse.json({message:"Card production job not found."},{status:404,headers:casaInternalNoStoreHeaders});
  await writeCasaInternalAudit({access,action:body.data.action==="MARK_PRINTED"?"CARD_PRODUCTION_MARKED_PRINTED":"CARD_PRODUCTION_PUBLIC_LINK_ROTATED",subjectType:"CARD_PRODUCTION_JOB",subjectId:jobId,metadata:{reason:body.data.reason??null}});
  return NextResponse.json({result},{headers:casaInternalNoStoreHeaders});
 }catch(error){const response=casaInternalAuthErrorResponse(error);if(response)return response;throw error}
}
