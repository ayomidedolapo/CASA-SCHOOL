import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  getSchoolWatermarkedCardProductionPreview,
} from "@/server/card-production/school-preview";
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
    jobId: string;
  }>;
}

export async function GET(
  _request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
    studentId,
    jobId,
  } =
    await context.params;

  if (
    !z.string()
      .uuid()
      .safeParse(
        jobId,
      )
      .success
  ) {
    return NextResponse.json(
      {
        message:
          "Invalid card production job.",
      },
      {
        status: 400,
        headers:
          registryNoStoreHeaders,
      },
    );
  }

  try {
    const access =
      await requireRegistryOperator(
        slug,
      );

    const preview =
      await getSchoolWatermarkedCardProductionPreview({
        schoolId:
          access.school.id,
        studentId,
        jobId,
      });

    if (!preview) {
      return NextResponse.json(
        {
          message:
            "School card preview is unavailable.",
        },
        {
          status: 404,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    return new NextResponse(
      new Uint8Array(
        preview,
      ),
      {
        status: 200,
        headers: {
          ...registryNoStoreHeaders,
          "Content-Type":
            "image/png",
          "Content-Disposition":
            'inline; filename="casa-student-id-card-school-preview.png"',
          "X-CASA-Card-Preview":
            "SCHOOL_WATERMARKED_QR",
        },
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

    throw error;
  }
}
