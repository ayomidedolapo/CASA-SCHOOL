import {
  and,
  eq,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getDb } from "@/db";
import {
  studentIdentityCards,
  studentCardProductionJobs,
} from "@/db/schema";
import {
  getPrivateCardObject,
} from "@/server/card-production/storage";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    publicKey: string;
  }>;
}

export async function GET(
  _request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    publicKey,
  } =
    await context.params;

  if (
    !/^[A-Za-z0-9_-]{43}$/.test(
      publicKey,
    )
  ) {
    return new NextResponse(
      "Not found",
      {
        status: 404,
        headers: {
          "Cache-Control":
            "private, no-store",
          "X-Robots-Tag":
            "noindex, nofollow, noarchive",
        },
      },
    );
  }

  const db = getDb();

  const lifecycleRows =
    await db
      .select({
        id:
          studentCardProductionJobs.id,
      })
      .from(
        studentCardProductionJobs,
      )
      .innerJoin(
        studentIdentityCards,
        and(
          eq(
            studentIdentityCards.schoolId,
            studentCardProductionJobs.schoolId,
          ),
          eq(
            studentIdentityCards.id,
            studentCardProductionJobs.cardId,
          ),
        ),
      )
      .where(
        and(
          eq(
            studentCardProductionJobs.publicAccessKey,
            publicKey,
          ),
          eq(
            studentIdentityCards.status,
            "ACTIVE",
          ),
        ),
      )
      .limit(1);

  if (!lifecycleRows[0]) {
    return new NextResponse(
      "Not found",
      {
        status: 404,
        headers: {
          "Cache-Control":
            "no-store",
          "X-CASA-Card-State":
            "CARD_PUBLIC_ARTIFACT_INACTIVE",
        },
      },
    );
  }


  const rows =
    await db
      .select({
        previewArtifactKey:
          studentCardProductionJobs.previewArtifactKey,
      })
      .from(
        studentCardProductionJobs,
      )
      .where(
        eq(
          studentCardProductionJobs.publicAccessKey,
          publicKey,
        ),
      )
      .limit(1);

  const job =
    rows[0];

  if (!job) {
    return new NextResponse(
      "Not found",
      {
        status: 404,
        headers: {
          "Cache-Control":
            "private, no-store",
          "X-Robots-Tag":
            "noindex, nofollow, noarchive",
        },
      },
    );
  }

  const artifact =
    await getPrivateCardObject(
      job.previewArtifactKey,
    );

  if (!artifact) {
    return new NextResponse(
      "Not found",
      {
        status: 404,
        headers: {
          "Cache-Control":
            "private, no-store",
          "X-Robots-Tag":
            "noindex, nofollow, noarchive",
        },
      },
    );
  }

  return new NextResponse(
    new Uint8Array(
      artifact,
    ),
    {
      status: 200,
      headers: {
        "Content-Type":
          "image/png",
        "Content-Disposition":
          'inline; filename="casa-student-id-card.png"',
        "Cache-Control":
          "private, no-store",
        "X-Robots-Tag":
          "noindex, nofollow, noarchive",
        "Referrer-Policy":
          "no-referrer",
      },
    },
  );
}