import {
  and,
  desc,
  eq,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  studentBiometricProfileEvents,
  studentBiometricProfiles,
  students,
} from "@/db/schema";
import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
} from "@/server/auth/authorization";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
  }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
  } =
    await context.params;

  try {
    const access =
      await requireSchoolRole(
        slug,
        [
          "OWNER",
          "ADMIN",
          "SCHOOL_TECHNICIAN",
        ],
      );

    const db = getDb();

    const studentRows =
      await db
        .select({
          id:
            students.id,
        })
        .from(students)
        .where(
          and(
            eq(
              students.schoolId,
              access.school.id,
            ),
            eq(
              students.id,
              studentId,
            ),
          ),
        )
        .limit(1);

    if (!studentRows[0]) {
      return NextResponse.json(
        {
          message:
            "Student not found.",
        },
        {
          status: 404,
        },
      );
    }

    const profiles =
      await db
        .select({
          id:
            studentBiometricProfiles.id,
          provider:
            studentBiometricProfiles.provider,
          status:
            studentBiometricProfiles.status,
          enrolledAt:
            studentBiometricProfiles.enrolledAt,
          revokedAt:
            studentBiometricProfiles.revokedAt,
          createdAt:
            studentBiometricProfiles.createdAt,
        })
        .from(
          studentBiometricProfiles,
        )
        .where(
          and(
            eq(
              studentBiometricProfiles.schoolId,
              access.school.id,
            ),
            eq(
              studentBiometricProfiles.studentId,
              studentId,
            ),
          ),
        )
        .orderBy(
          desc(
            studentBiometricProfiles.createdAt,
          ),
        );

    const events =
      await db
        .select({
          id:
            studentBiometricProfileEvents.id,
          profileId:
            studentBiometricProfileEvents.profileId,
          previousProfileId:
            studentBiometricProfileEvents.previousProfileId,
          eventType:
            studentBiometricProfileEvents.eventType,
          provider:
            studentBiometricProfileEvents.provider,
          actorMembershipId:
            studentBiometricProfileEvents.actorMembershipId,
          createdAt:
            studentBiometricProfileEvents.createdAt,
        })
        .from(
          studentBiometricProfileEvents,
        )
        .where(
          and(
            eq(
              studentBiometricProfileEvents.schoolId,
              access.school.id,
            ),
            eq(
              studentBiometricProfileEvents.studentId,
              studentId,
            ),
          ),
        )
        .orderBy(
          desc(
            studentBiometricProfileEvents.createdAt,
          ),
        );

    return NextResponse.json(
      {
        activeProfile:
          profiles.find(
            (profile) =>
              profile.status ===
              "ACTIVE",
          ) ?? null,
        profiles,
        events,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      AuthRequiredError
    ) {
      return NextResponse.json(
        {
          message:
            "Authentication required.",
        },
        {
          status: 401,
        },
      );
    }

    if (
      error instanceof
      SchoolAccessDeniedError
    ) {
      return NextResponse.json(
        {
          message:
            "Biometric access denied.",
        },
        {
          status: 403,
        },
      );
    }

    throw error;
  }
}