import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { requireCasaCapability, requireCasaInternalSchoolAccess } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse, casaInternalNoStoreHeaders } from "@/server/internal/http";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";
export const dynamic="force-dynamic";
const bodySchema=z.object({name:z.string().trim().min(1).max(120),code:z.string().trim().toUpperCase().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/).max(32),address:z.string().trim().max(1000).nullable().optional()});
async function requireStructure(schoolId:string){const access=await requireCasaInternalSchoolAccess(schoolId);if(access.membership.role!=="CASA_SUPER_ADMIN")await requireCasaCapability("ORGANIZATION_RESTRUCTURE");return access}
export async function POST(request:NextRequest,{params}:{params:Promise<{schoolId:string}>}){const{schoolId}=await params;try{const access=await requireStructure(schoolId);const parsed=bodySchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({message:"Check the branch name and code."},{status:400,headers:casaInternalNoStoreHeaders});const id=randomUUID();try{await getDb().execute(sql`insert into school_branches(id,school_id,name,code,is_headquarters,status,address) values(${id}::uuid,${schoolId}::uuid,${parsed.data.name},${parsed.data.code},false,'ACTIVE',${parsed.data.address??null})`)}catch(error){const m=error instanceof Error?error.message:"";if(m.includes("school_branches_school_code_unique")||m.includes("school_branches_school_name_unique"))return NextResponse.json({message:"A branch with that name or code already exists in this school."},{status:409,headers:casaInternalNoStoreHeaders});throw error}await writeCasaInternalAudit({access,schoolId,action:"INTERNAL_BRANCH_CREATED",subjectType:"SCHOOL_BRANCH",subjectId:id,metadata:{name:parsed.data.name,code:parsed.data.code}});return NextResponse.json({created:true,id},{status:201,headers:casaInternalNoStoreHeaders})}catch(error){const r=casaInternalAuthErrorResponse(error);if(r)return r;throw error}}
