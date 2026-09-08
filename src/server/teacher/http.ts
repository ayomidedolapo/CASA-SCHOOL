import {
  NextResponse,
} from "next/server";

import {
  SchoolAccessDeniedError,
} from "@/server/auth/authorization";

import {
  TeacherMyClassError,
} from "./my-class";

export const teacherMyClassNoStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export function teacherMyClassErrorResponse(
  error: unknown,
) {
  if (
    error instanceof
      SchoolAccessDeniedError
  ) {
    return NextResponse.json(
      {
        code:
          "TEACHER_ACCESS_DENIED",
        message:
          "Teacher access denied.",
      },
      {
        status:
          403,
        headers:
          teacherMyClassNoStoreHeaders,
      },
    );
  }

  if (
    error instanceof
      TeacherMyClassError
  ) {
    return NextResponse.json(
      {
        code:
          error.code,
        message:
          error.message,
      },
      {
        status:
          error.status,
        headers:
          teacherMyClassNoStoreHeaders,
      },
    );
  }

  return null;
}
