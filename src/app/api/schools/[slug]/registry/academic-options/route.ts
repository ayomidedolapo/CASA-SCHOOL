import {
  and,
  asc,
  eq,
  inArray,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  academicSessions,
  classArms,
  classLevels,
} from "@/db/schema";
import {
  registryAuthErrorResponse,
  registryNoStoreHeaders,
  requireRegistryAdmin,
} from "@/server/registry/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
  }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const { slug } =
    await context.params;

  try {
    const access =
      await requireRegistryAdmin(slug);
    const db = getDb();

    const [sessions, arms] =
      await db.batch([
        db
          .select({
            id:
              academicSessions.id,
            name:
              academicSessions.name,
            startsOn:
              academicSessions.startsOn,
            endsOn:
              academicSessions.endsOn,
            status:
              academicSessions.status,
          })
          .from(academicSessions)
          .where(
            and(
              eq(
                academicSessions.schoolId,
                access.school.id,
              ),
              inArray(
                academicSessions.status,
                [
                  "PLANNED",
                  "ACTIVE",
                ],
              ),
            ),
          )
          .orderBy(
            asc(
              academicSessions.startsOn,
            ),
          ),
        db
          .select({
            id: classArms.id,
            name: classArms.name,
            classLevelId:
              classLevels.id,
            classLevelName:
              classLevels.name,
            sortOrder:
              classLevels.sortOrder,
          })
          .from(classArms)
          .innerJoin(
            classLevels,
            and(
              eq(
                classLevels.schoolId,
                classArms.schoolId,
              ),
              eq(
                classLevels.id,
                classArms.classLevelId,
              ),
            ),
          )
          .where(
            and(
              eq(
                classArms.schoolId,
                access.school.id,
              ),
              eq(
                classArms.isActive,
                true,
              ),
              eq(
                classLevels.isActive,
                true,
              ),
            ),
          )
          .orderBy(
            asc(
              classLevels.sortOrder,
            ),
            asc(
              classLevels.name,
            ),
            asc(classArms.name),
          ),
      ]);

    return NextResponse.json(
      {
        sessions,
        classArms: arms,
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const authResponse =
      registryAuthErrorResponse(
        error,
      );

    if (authResponse) {
      return authResponse;
    }

    throw error;
  }
}