import {
  NextRequest,
  NextResponse,
} from "next/server";

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
    cardId: string;
  }>;
}

export async function POST(
  _request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
  } =
    await context.params;

  try {
    await requireRegistryOperator(
      slug,
    );

    return NextResponse.json(
      {
        message:
          "Raw replacement-card issuance is disabled. Reissue through the Passkey-protected production endpoint.",
        code:
          "CARD_PRODUCTION_REQUIRED",
        endpoint:
          "cards/production",
      },
      {
        status: 409,
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