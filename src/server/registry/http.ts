import { NextResponse } from "next/server";

import {
  AuthRequiredError,
  SchoolAccessDeniedError,
  requireSchoolRole,
  type SchoolAccess,
} from "@/server/auth/authorization";

export const registryNoStoreHeaders = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",
} as const;

export async function requireRegistryAdmin(
  schoolSlug: string,
): Promise<SchoolAccess> {
  return requireSchoolRole(
    schoolSlug,
    ["OWNER", "ADMIN"],
  );
}

export function registryAuthErrorResponse(
  error: unknown,
): NextResponse | null {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json(
      {
        message:
          "Authentication required.",
      },
      {
        status: 401,
        headers:
          registryNoStoreHeaders,
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
          "School registry access denied.",
      },
      {
        status: 403,
        headers:
          registryNoStoreHeaders,
      },
    );
  }

  return null;
}

export function registryDatabaseErrorResponse(
  error: unknown,
): NextResponse | null {
  const candidate =
    error as {
      code?: string;
      cause?: {
        code?: string;
      };
    };

  const code =
    candidate.code ??
    candidate.cause?.code;

  if (code === "23505") {
    return NextResponse.json(
      {
        message:
          "That record conflicts with an existing school record.",
      },
      {
        status: 409,
        headers:
          registryNoStoreHeaders,
      },
    );
  }

  if (code === "23503") {
    return NextResponse.json(
      {
        message:
          "A referenced school record is invalid or unavailable.",
      },
      {
        status: 400,
        headers:
          registryNoStoreHeaders,
      },
    );
  }

  if (code === "23514") {
    return NextResponse.json(
      {
        message:
          "The record violates a school registry rule.",
      },
      {
        status: 400,
        headers:
          registryNoStoreHeaders,
      },
    );
  }

  return null;
}