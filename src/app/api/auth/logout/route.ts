import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getCurrentAuthSession,
  revokeCurrentAuthSession,
} from "@/server/auth/session";
import {
  getTrustedSourceAddress,
  recordAuthSecurityEvent,
  securityFingerprint,
} from "@/server/auth/security";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
) {
  const session =
    await getCurrentAuthSession();

  await revokeCurrentAuthSession();

  if (session) {
    const identity =
      session.email ??
      session.phone ??
      session.userId;

    await recordAuthSecurityEvent({
      eventType: "LOGOUT",
      identifierHash:
        securityFingerprint(
          "logout-identity",
          identity,
        ),
      userId: session.userId,
      sourceAddressHash:
        getTrustedSourceAddress(
          request,
        )
          ? securityFingerprint(
              "source-address",
              getTrustedSourceAddress(
                request,
              )!,
            )
          : null,
    });
  }

  return NextResponse.json({
    signedOut: true,
  });
}