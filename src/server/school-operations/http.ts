import { NextResponse } from "next/server";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
} from "@/server/auth/authorization";
import { SchoolOperationsError } from "./errors";

export const schoolOperationsNoStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export function schoolOperationsErrorResponse(
  error: unknown,
) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json(
      { message: error.message },
      {
        status: 401,
        headers: schoolOperationsNoStoreHeaders,
      },
    );
  }

  if (error instanceof SchoolAccessDeniedError) {
    return NextResponse.json(
      { message: error.message },
      {
        status: 403,
        headers: schoolOperationsNoStoreHeaders,
      },
    );
  }

  if (error instanceof SchoolOperationsError) {
    return NextResponse.json(
      {
        message: error.message,
        code: error.code,
      },
      {
        status: error.status,
        headers: schoolOperationsNoStoreHeaders,
      },
    );
  }

  return null;
}
