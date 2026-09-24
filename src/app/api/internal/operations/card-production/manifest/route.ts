import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { buildCardProductionManifest } from "@/server/card-production/manifest";
import { listCentralProductionJobs, markJobsExported } from "@/server/card-production/production";
import { requireCasaCapability } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse, casaInternalNoStoreHeaders } from "@/server/internal/http";
import { writeCasaInternalAudit } from "@/server/internal/onboarding";

export const dynamic = "force-dynamic";
const bodySchema = z.object({ status: z.enum(["READY", "EXPORTED", "PRINTED"]).nullable().optional(), category: z.enum(["FIRST_CARD", "REPLACEMENT", "OTHER"]).nullable().optional(), schoolId: z.string().uuid().nullable().optional(), branchId: z.string().uuid().nullable().optional(), limit: z.number().int().min(1).max(5000).default(1000) });
function rowsOf<T>(result: unknown): T[] { if (Array.isArray(result)) return result as T[]; if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows?: unknown }).rows)) return (result as { rows: T[] }).rows; return []; }

export async function POST(request: NextRequest) {
  try {
    const access = await requireCasaCapability("CARD_PRODUCTION_ADMIN");
    const body = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ message: "Invalid production manifest request." }, { status: 400, headers: casaInternalNoStoreHeaders });
    if (body.data.status === "PRINTED") return NextResponse.json({ message: "Printed card history cannot be exported into a new production manifest." }, { status: 409, headers: casaInternalNoStoreHeaders });
    const jobs = await listCentralProductionJobs({ status: body.data.status ?? null, category: body.data.category ?? null, schoolId: body.data.schoolId ?? null, branchId: body.data.branchId ?? null, exportableOnly: true, limit: body.data.limit, origin: request.nextUrl.origin });
    const ids = jobs.map((job) => job.studentId);
    const db = getDb();
    const branchRows = ids.length === 0 ? [] : rowsOf<{ student_id: string; branch_id: string | null; branch_name: string | null }>(await db.execute(sql`
      select distinct on (e.student_id)
        e.student_id,
        branch.id as branch_id,
        branch.name as branch_name
      from student_enrollments e
      left join school_branch_class_arms branch_arm
        on branch_arm.school_id = e.school_id
       and branch_arm.class_arm_id = e.class_arm_id
      left join school_branches branch
        on branch.school_id = e.school_id
       and branch.id = branch_arm.branch_id
      where e.student_id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
      order by e.student_id, case when e.status = 'ACTIVE'::student_enrollment_status then 0 else 1 end, e.starts_on desc
    `));
    const branchByStudent = new Map(branchRows.map((row) => [row.student_id, row]));
    const enriched = jobs.map((job) => ({ ...job, branchName: job.renderSnapshot.branchName ?? branchByStudent.get(job.studentId)?.branch_name ?? null, branchId: job.renderSnapshot.branchId ?? branchByStudent.get(job.studentId)?.branch_id ?? null }));
    const exportJobs = body.data.branchId ? enriched.filter((job) => job.branchId === body.data.branchId) : enriched;
    const exportDate = new Date().toISOString().slice(0, 10);
    const workbook = await buildCardProductionManifest({ jobs: exportJobs, exportDate });
    await markJobsExported(exportJobs.map((job) => job.id));
    await writeCasaInternalAudit({ access, schoolId: body.data.schoolId ?? undefined, action: "CARD_PRODUCTION_MANIFEST_EXPORTED", subjectType: "CARD_PRODUCTION_MANIFEST", metadata: { status: body.data.status ?? null, category: body.data.category ?? null, branchId: body.data.branchId ?? null, jobCount: exportJobs.length, exportDate } });
    return new NextResponse(new Uint8Array(workbook), { status: 200, headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="casa-card-production-${exportDate}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
