import { NextResponse } from "next/server";

import {
  AuthRequiredError,
} from "@/server/auth/authorization";
import {
  CasaInternalAccessDeniedError,
  CasaInternalCapabilityError,
  CasaInternalSchoolScopeError,
} from "./authorization";

export const casaInternalNoStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export function casaInternalAuthErrorResponse(
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
          casaInternalNoStoreHeaders,
      },
    );
  }

  if (
    error instanceof
      CasaInternalSchoolScopeError
  ) {
    return NextResponse.json(
      {
        message:
          error.message,
        code:
          "CASA_INTERNAL_SCHOOL_SCOPE_REQUIRED",
      },
      {
        status: 403,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  }

  if (
    error instanceof
      CasaInternalCapabilityError
  ) {
    return NextResponse.json(
      {
        message:
          error.message,
        code:
          "CASA_INTERNAL_CAPABILITY_REQUIRED",
        capability:
          error.capability,
      },
      {
        status: 403,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  }

  if (
    error instanceof
      CasaInternalAccessDeniedError
  ) {
    return NextResponse.json(
      {
        message:
          error.message,
        code:
          "CASA_INTERNAL_ACCESS_DENIED",
      },
      {
        status: 403,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  }

  return null;
}
