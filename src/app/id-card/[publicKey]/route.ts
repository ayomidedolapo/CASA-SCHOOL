import {
  and,
  eq,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getDb,
} from "@/db";
import {
  studentCardProductionJobs,
  studentIdentityCards,
} from "@/db/schema";
import {
  getSchoolWatermarkedCardProductionPreview,
} from "@/server/card-production/school-preview";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    publicKey: string;
  }>;
}

function notFound(
  state:
    string,
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
        "X-CASA-Card-State":
          state,
      },
    },
  );
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
    return notFound(
      "INVALID_PUBLIC_KEY",
    );
  }

  const rows =
    await getDb()
      .select({
        jobId:
          studentCardProductionJobs.id,
        schoolId:
          studentCardProductionJobs.schoolId,
        studentId:
          studentCardProductionJobs.studentId,
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

  const job =
    rows[0];

  if (!job) {
    return notFound(
      "CARD_PUBLIC_ARTIFACT_INACTIVE",
    );
  }

  const preview =
    await getSchoolWatermarkedCardProductionPreview({
      schoolId:
        job.schoolId,
      studentId:
        job.studentId,
      jobId:
        job.jobId,
    });

  if (!preview) {
    return notFound(
      "CARD_PREVIEW_UNAVAILABLE",
    );
  }

  return new NextResponse(
    new Uint8Array(
      preview,
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
        "X-CASA-Card-Preview":
          "PUBLIC_WATERMARKED_QR",
      },
    },
  );
}
