import {
  timingSafeEqual,
} from "node:crypto";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

const HEADER_NAME =
  "x-casa-production-key";

function equalSecret(
  left: string,
  right: string,
): boolean {
  const a =
    Buffer.from(
      left,
      "utf8",
    );
  const b =
    Buffer.from(
      right,
      "utf8",
    );

  if (
    a.length !==
    b.length
  ) {
    return false;
  }

  return timingSafeEqual(
    a,
    b,
  );
}

export type InternalProductionAuthResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      response:
        NextResponse;
    };

export function requireInternalCardProduction(
  request:
    NextRequest,
): InternalProductionAuthResult {
  const supplied =
    request.headers.get(
      HEADER_NAME,
    );

  if (!supplied) {
    return {
      ok: false,
      response:
        NextResponse.json(
          {
            message:
              "CASA production authorization required.",
          },
          {
            status: 401,
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        ),
    };
  }

  const configured =
    process.env
      .CASA_CARD_PRODUCTION_INTERNAL_KEY
      ?.trim();

  if (
    !configured ||
    configured.length <
      32
  ) {
    return {
      ok: false,
      response:
        NextResponse.json(
          {
            message:
              "CASA card-production internal authorization is not configured.",
            code:
              "CARD_PRODUCTION_INTERNAL_AUTH_NOT_CONFIGURED",
          },
          {
            status: 503,
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        ),
    };
  }

  if (
    !equalSecret(
      supplied,
      configured,
    )
  ) {
    return {
      ok: false,
      response:
        NextResponse.json(
          {
            message:
              "CASA production authorization denied.",
          },
          {
            status: 401,
            headers: {
              "Cache-Control":
                "no-store",
            },
          },
        ),
    };
  }

  return {
    ok: true,
  };
}