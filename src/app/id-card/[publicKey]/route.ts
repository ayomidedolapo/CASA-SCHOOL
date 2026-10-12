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

type PublicCardStatus =
  | "READY_FOR_ACTIVATION"
  | "ACTIVE"
  | "LOST"
  | "REVOKED"
  | "REPLACED"
  | "EXPIRED";

const revisionHeaders = {
  "Cache-Control":
    "private, no-store",
  "X-Robots-Tag":
    "noindex, nofollow, noarchive",
  "Referrer-Policy":
    "no-referrer",
  "X-CASA-Card-Preview-Revision":
    "M72",
} as const;

function publicCardError(
  status:
    number,
  state:
    string,
  message:
    string,
) {
  return new NextResponse(
    message,
    {
      status,
      headers: {
        ...revisionHeaders,
        "Content-Type":
          "text/plain; charset=utf-8",
        "X-CASA-Card-State":
          state,
      },
    },
  );
}

function inactiveCardResponse(
  status:
    Exclude<
      PublicCardStatus,
      | "READY_FOR_ACTIVATION"
      | "ACTIVE"
    >,
) {
  switch (status) {
    case "LOST":
      return publicCardError(
        410,
        "CARD_LOST",
        "This student card has been marked lost and is no longer valid.",
      );
    case "REVOKED":
      return publicCardError(
        410,
        "CARD_REVOKED",
        "This student card has been revoked and is no longer valid.",
      );
    case "REPLACED":
      return publicCardError(
        410,
        "CARD_REPLACED",
        "This student card has been replaced and is no longer valid. Please use the current card.",
      );
    case "EXPIRED":
      return publicCardError(
        410,
        "CARD_EXPIRED",
        "This student card has expired and is no longer valid.",
      );
  }
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
    return publicCardError(
      404,
      "INVALID_PUBLIC_KEY",
      "This student card link is invalid.",
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
        cardStatus:
          studentIdentityCards.status,
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
        eq(
          studentCardProductionJobs.publicAccessKey,
          publicKey,
        ),
      )
      .limit(1);

  const job =
    rows[0];

  if (!job) {
    return publicCardError(
      404,
      "CARD_PUBLIC_ARTIFACT_NOT_FOUND",
      "This student card link was not found.",
    );
  }

  const cardStatus =
    job.cardStatus as
      PublicCardStatus;

  if (
    cardStatus !==
      "READY_FOR_ACTIVATION" &&
    cardStatus !==
      "ACTIVE"
  ) {
    return inactiveCardResponse(
      cardStatus,
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
    return publicCardError(
      503,
      "CARD_PREVIEW_TEMPORARILY_UNAVAILABLE",
      "This student card is valid, but its preview is temporarily unavailable.",
    );
  }

  return new NextResponse(
    new Uint8Array(
      preview,
    ),
    {
      status: 200,
      headers: {
        ...revisionHeaders,
        "Content-Type":
          "image/png",
        "Content-Disposition":
          'inline; filename="casa-student-id-card.png"',
        "X-CASA-Card-Preview":
          "PUBLIC_WATERMARKED_QR",
        "X-CASA-Card-State":
          cardStatus ===
            "ACTIVE"
            ? "CARD_ACTIVE"
            : "CARD_READY_FOR_ACTIVATION",
      },
    },
  );
}
