import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { requireCasaCapability, requireCasaInternalSchoolAccess } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse, casaInternalNoStoreHeaders } from "@/server/internal/http";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";
const bodySchema=z.object({status:z.enum(["ACTIVE","INACTIVE"])});
function rows(r:unknown):unknown[]{if(Array.isArray(r))return r;if(r&&typeof r==="object"&&"rows" in r&&Array.isArray((r as {rows?:unknown}).rows))return (r as {rows:unknown[]}).rows;return []}
export async function PATCH(request:NextRequest,{params}:{params:Promise<{schoolId:string;branchId:string}>}){const{schoolId,branchId}=await params;try{const access=await requireCasaInternalSchoolAccess(schoolId);if(access.membership.role!=="CASA_SUPER_ADMIN")await requireCasaCapability("ORGANIZATION_RESTRUCTURE");const parsed=bodySchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({message:"Invalid branch status."},{status:400,headers:casaInternalNoStoreHeaders});const result=await getDb().execute(sql`update school_branches set status=${parsed.data.status}::school_branch_status,updated_at=now() where id=${branchId}::uuid and school_id=${schoolId}::uuid and is_headquarters=false returning id`);if(rows(result).length!==1)return NextResponse.json({message:"Branch not found or headquarters status cannot be changed here."},{status:404,headers:casaInternalNoStoreHeaders});await writeCasaInternalAudit({access,schoolId,action:"INTERNAL_BRANCH_STATUS_CHANGED",subjectType:"SCHOOL_BRANCH",subjectId:branchId,metadata:{status:parsed.data.status}});return NextResponse.json({updated:true,status:parsed.data.status},{headers:casaInternalNoStoreHeaders})}catch(error){const r=casaInternalAuthErrorResponse(error);if(r)return r;throw error}}
