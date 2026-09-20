import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { schools, studentCardTemplates } from "@/db/schema";
import { renderStudentCardTemplatePreviewSide } from "@/server/card-production/render";
import { getPrivateCardObject } from "@/server/card-production/storage";
import { requireCasaCapability } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse } from "@/server/internal/http";

interface RouteContext { params: Promise<{ templateId: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireCasaCapability("MASTER_TEMPLATE_ADMIN");
    const { templateId } = await context.params;
    const side = request.nextUrl.searchParams.get("side") === "BACK" ? "BACK" : "FRONT";
    const raw = request.nextUrl.searchParams.get("raw") === "1";
    const db = getDb();
    const [template] = await db
      .select({
        frontSourceKey: studentCardTemplates.frontSourceKey,
        backSourceKey: studentCardTemplates.backSourceKey,
        layout: studentCardTemplates.layout,
        versionLabel: studentCardTemplates.versionLabel,
        schoolName: schools.name,
      })
      .from(studentCardTemplates)
      .innerJoin(schools, eq(schools.id, studentCardTemplates.schoolId))
      .where(eq(studentCardTemplates.id, templateId))
      .limit(1);

    if (!template) return NextResponse.json({ message: "Card template not found." }, { status: 404 });

    const object = raw
      ? await getPrivateCardObject(side === "BACK" ? template.backSourceKey : template.frontSourceKey)
      : await renderStudentCardTemplatePreviewSide({
          side,
          template,
          snapshot: {
            schoolName: template.schoolName,
            studentName: "Amina Chukwuemeka Okafor",
            casaStudentId: "CASA-000000",
            admissionNumber: "SAMPLE",
            dateOfBirth: "2012-01-01",
            sex: "F",
            className: "JSS 2 A",
            academicSession: null,
            cardSerial: "SAMPLE",
            templateVersion: template.versionLabel,
          },
        });

    if (!object) return NextResponse.json({ message: "Card template artwork is unavailable." }, { status: 404 });
    return new NextResponse(new Uint8Array(object), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
