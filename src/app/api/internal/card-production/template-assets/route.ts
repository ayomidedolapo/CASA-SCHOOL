import {
  randomUUID,
} from "node:crypto";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import sharp from "sharp";

import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";
import {
  putPrivateCardObject,
} from "@/server/card-production/storage";

export const dynamic =
  "force-dynamic";

const MAX_TEMPLATE_BYTES =
  15 * 1024 * 1024;

export async function POST(
  request:
    NextRequest,
) {
  const auth =
    requireInternalCardProduction(
      request,
    );

  if (!auth.ok) {
    return auth.response;
  }

  const form =
    await request.formData();

  const file =
    form.get(
      "file",
    );

  if (
    !(file instanceof File)
  ) {
    return NextResponse.json(
      {
        message:
          "A template image file is required.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  if (
    file.size <= 0 ||
    file.size >
      MAX_TEMPLATE_BYTES
  ) {
    return NextResponse.json(
      {
        message:
          "Template image must be between 1 byte and 15 MiB.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const source =
    Buffer.from(
      await file.arrayBuffer(),
    );

  let normalized:
    Buffer;

  try {
    normalized =
      await sharp(
        source,
        {
          limitInputPixels:
            40_000_000,
        },
      )
        .rotate()
        .png()
        .toBuffer();
  } catch {
    return NextResponse.json(
      {
        message:
          "Template asset is not a supported image.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const key =
    `card-production/templates/assets/${randomUUID()}.png`;

  await putPrivateCardObject({
    key,
    body:
      normalized,
    contentType:
      "image/png",
  });

  return NextResponse.json(
    {
      key,
      contentType:
        "image/png",
      bytes:
        normalized.length,
    },
    {
      status: 201,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}