import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "@/db";
import { studentCardTemplates } from "@/db/schema";
import { getPrivateCardObject } from "@/server/card-production/storage";
import { requireCasaCapability } from "@/server/internal/authorization";
import { casaInternalAuthErrorResponse } from "@/server/internal/http";

interface RouteContext { params: Promise<{ templateId: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    await requireCasaCapability("MASTER_TEMPLATE_ADMIN");
    const { templateId } = await context.params;
    const side = request.nextUrl.searchParams.get("side") === "BACK" ? "BACK" : "FRONT";
    const db = getDb();
    const [template] = await db.select({ frontSourceKey: studentCardTemplates.frontSourceKey, backSourceKey: studentCardTemplates.backSourceKey }).from(studentCardTemplates).where(eq(studentCardTemplates.id, templateId)).limit(1);
    if (!template) return NextResponse.json({ message: "Card template not found." }, { status: 404 });
    const object = await getPrivateCardObject(side === "BACK" ? template.backSourceKey : template.frontSourceKey);
    if (!object) return NextResponse.json({ message: "Card template artwork is unavailable." }, { status: 404 });
    return new NextResponse(new Uint8Array(object), { status: 200, headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow, noarchive" } });
  } catch (error) {
    const response = casaInternalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
