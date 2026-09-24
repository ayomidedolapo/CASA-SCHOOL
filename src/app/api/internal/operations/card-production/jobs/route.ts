import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { listCentralProductionJobs } from "@/server/card-production/production";
import { requireCasaCapability } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse, casaInternalNoStoreHeaders } from "@/server/internal/http";

export const dynamic="force-dynamic";
const statusSchema=z.enum(["READY","EXPORTED","PRINTED"]);
const categorySchema=z.enum(["FIRST_CARD","REPLACEMENT","OTHER"]);

export async function GET(request:NextRequest){
 try{
  await requireCasaCapability("CARD_PRODUCTION_ADMIN");
  const statusValue=request.nextUrl.searchParams.get("status");
  const status=statusValue?statusSchema.safeParse(statusValue):null;
  if(status&&!status.success)return NextResponse.json({message:"Invalid production status filter."},{status:400,headers:casaInternalNoStoreHeaders});
  const categoryValue=request.nextUrl.searchParams.get("category");
  const category=categoryValue?categorySchema.safeParse(categoryValue):null;
  if(category&&!category.success)return NextResponse.json({message:"Invalid card type filter."},{status:400,headers:casaInternalNoStoreHeaders});
  const schoolId=request.nextUrl.searchParams.get("schoolId");
  if(schoolId&&!z.string().uuid().safeParse(schoolId).success)return NextResponse.json({message:"Invalid school filter."},{status:400,headers:casaInternalNoStoreHeaders});
  const branchId=request.nextUrl.searchParams.get("branchId");
  if(branchId&&!z.string().uuid().safeParse(branchId).success)return NextResponse.json({message:"Invalid branch filter."},{status:400,headers:casaInternalNoStoreHeaders});
  const requested=Number(request.nextUrl.searchParams.get("limit")??"250");
  const limit=Math.min(1000,Math.max(1,Number.isFinite(requested)?Math.floor(requested):250));
  const jobs=await listCentralProductionJobs({status:status?.success?status.data:null,category:category?.success?category.data:null,schoolId:schoolId??null,branchId:branchId??null,limit,origin:request.nextUrl.origin});
  return NextResponse.json({jobs},{headers:casaInternalNoStoreHeaders});
 }catch(error){const response=casaInternalAuthErrorResponse(error);if(response)return response;throw error}
}
