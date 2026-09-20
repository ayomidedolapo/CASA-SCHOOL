import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { getPrivateCardObject } from "@/server/card-production/storage";
import { requireCasaCapability } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse,casaInternalNoStoreHeaders } from "@/server/internal/http";
export const dynamic="force-dynamic";type Ctx={params:Promise<{jobId:string}>};
function rowsOf<T>(r:unknown):T[]{if(Array.isArray(r))return r as T[];if(r&&typeof r==="object"&&"rows" in r&&Array.isArray((r as {rows?:unknown}).rows))return (r as {rows:T[]}).rows;return[]}
export async function GET(_req:NextRequest,ctx:Ctx){try{await requireCasaCapability("CARD_PRODUCTION_ADMIN");const {jobId}=await ctx.params;const row=rowsOf<{preview_artifact_key:string}>(await getDb().execute(sql`select preview_artifact_key from student_card_production_jobs where id=${jobId}::uuid limit 1`))[0];if(!row)return NextResponse.json({message:"Card production job not found."},{status:404,headers:casaInternalNoStoreHeaders});const bytes=await getPrivateCardObject(row.preview_artifact_key);if(!bytes)return NextResponse.json({message:"Card preview artifact is unavailable."},{status:404,headers:casaInternalNoStoreHeaders});return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"image/png","Cache-Control":"private, no-store","Content-Disposition":"inline"}})}catch(e){const r=casaInternalAuthErrorResponse(e);if(r)return r;return NextResponse.json({message:"Card preview could not be loaded."},{status:500,headers:casaInternalNoStoreHeaders})}}
