import {
  NextResponse,
} from "next/server";

export const dynamic =
  "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      message:
        "WhatsApp delivery is currently disabled. CASA uses SimHostNG SMS for guardian notifications.",
      code:
        "WHATSAPP_SHELVED",
    },
    {
      status:
        410,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}
