import { NextResponse } from "next/server";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
  type SchoolAccess,
} from "@/server/auth/authorization";

export const attendanceNoStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function requireAttendanceOperator(
  schoolSlug: string,
): Promise<SchoolAccess> {
  return requireSchoolRole(
    schoolSlug,
    [
      "OWNER",
      "ADMIN",
      "SCHOOL_TECHNICIAN",
    ],
  );
}

export function attendanceAuthErrorResponse(
  error: unknown,
): NextResponse | null {
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
        headers:
          attendanceNoStoreHeaders,
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
          "Attendance access denied.",
      },
      {
        status: 403,
        headers:
          attendanceNoStoreHeaders,
      },
    );
  }

  return null;
}

export function terminalUnauthorizedResponse():
  NextResponse {
  return NextResponse.json(
    {
      message:
        "Terminal authentication required.",
    },
    {
      status: 401,
      headers:
        attendanceNoStoreHeaders,
    },
  );
}
export async function requireAttendanceManager(
  schoolSlug: string,
): Promise<SchoolAccess> {
  return requireSchoolRole(
    schoolSlug,
    [
      "OWNER",
      "ADMIN",
    ],
  );
}

export async function requireEarlyDepartureAuthorizer(
  schoolSlug: string,
): Promise<SchoolAccess> {
  return requireAttendanceManager(
    schoolSlug,
  );
}