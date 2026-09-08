import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  requireCasaInternalSchoolAccess,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";
import {
  acquireCasaOnboardingLock,
  releaseCasaOnboardingLock,
} from "@/server/internal/onboarding";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    schoolId: string;
    studentId: string;
  }>;
}

export async function PUT(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    schoolId,
    studentId,
  } = await context.params;

  try {
    const access =
      await requireCasaInternalSchoolAccess(
        schoolId,
      );
    const lock =
      await acquireCasaOnboardingLock({
        access,
        studentId,
      });

    if (!lock) {
      return NextResponse.json(
        {
          message:
            "This student is currently being handled by another CASA operator.",
          code:
            "CASA_ONBOARDING_LOCKED",
        },
        {
          status: 409,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        lock,
      },
      {
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      casaInternalAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    schoolId,
    studentId,
  } = await context.params;

  try {
    const access =
      await requireCasaInternalSchoolAccess(
        schoolId,
      );

    const released =
      await releaseCasaOnboardingLock({
        access,
        studentId,
      });

    if (!released) {
      return NextResponse.json(
        {
          released:
            false,
          message:
            "This student's onboarding lock is not owned by the current CASA operator, or it was already released.",
          code:
            "CASA_ONBOARDING_LOCK_NOT_RELEASED",
        },
        {
          status: 409,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        released:
          true,
      },
      {
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      casaInternalAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}
