import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CardReplacementCompletionError,
  completeStudentCardReplacement,
} from "@/server/attendance/card-replacement-completion";
import {
  registryAuthErrorResponse,
  registryNoStoreHeaders,
  requireRegistryOperator,
} from "@/server/registry/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
  }>;
}

export async function POST(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
  } = await context.params;

  try {
    const access =
      await requireRegistryOperator(
        slug,
      );

    const replacement =
      await completeStudentCardReplacement({
        access,
        studentId,
      });

    return NextResponse.json(
      {
        replacement,
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      registryAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    if (
      error instanceof
      CardReplacementCompletionError
    ) {
      return NextResponse.json(
        {
          message:
            error.message,
          code:
            error.code,
        },
        {
          status:
            error.status,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    throw error;
  }
}
