import {
  and,
  eq,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  z,
} from "zod";

import {
  getDb,
} from "@/db";
import {
  studentEnrollments,
} from "@/db/schema";
import {
  registryAuthErrorResponse,
  registryDatabaseErrorResponse,
  registryNoStoreHeaders,
  requireRegistryAdmin,
} from "@/server/registry/http";

export const dynamic =
  "force-dynamic";

const schema =
  z.object({
    academicSessionId:
      z.string()
        .uuid(),
    classArmId:
      z.string()
        .uuid(),
    startsOn:
      z.string()
        .date(),
    endsOn:
      z.string()
        .date()
        .nullable(),
    status:
      z.enum([
        "ACTIVE",
        "COMPLETED",
        "WITHDRAWN",
        "TRANSFERRED",
      ]),
  });

export async function PATCH(
  request: NextRequest,
  context: {
    params:
      Promise<{
        slug: string;
        studentId: string;
        enrollmentId: string;
      }>;
  },
) {
  const {
    slug,
    studentId,
    enrollmentId,
  } =
    await context.params;

  try {
    const access =
      await requireRegistryAdmin(
        slug,
      );
    const parsed =
      schema.safeParse(
        await request.json(),
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Check the enrollment correction.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const data =
      parsed.data;

    if (
      data.status ===
        "ACTIVE" &&
      data.endsOn !==
        null
    ) {
      return NextResponse.json(
        {
          message:
            "An active enrollment cannot have an end date.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    if (
      data.status !==
        "ACTIVE" &&
      data.endsOn ===
        null
    ) {
      return NextResponse.json(
        {
          message:
            "Choose an end date when closing or transferring an enrollment.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const row =
      await getDb()
        .update(
          studentEnrollments,
        )
        .set({
          academicSessionId:
            data.academicSessionId,
          classArmId:
            data.classArmId,
          startsOn:
            data.startsOn,
          endsOn:
            data.status ===
              "ACTIVE"
              ? null
              : data.endsOn,
          status:
            data.status,
          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              studentEnrollments.schoolId,
              access.school.id,
            ),
            eq(
              studentEnrollments.studentId,
              studentId,
            ),
            eq(
              studentEnrollments.id,
              enrollmentId,
            ),
          ),
        )
        .returning({
          id:
            studentEnrollments.id,
        });

    if (!row[0]) {
      return NextResponse.json(
        {
          message:
            "Enrollment not found.",
        },
        {
          status: 404,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      {
        updated: true,
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (
    error
  ) {
    return (
      registryAuthErrorResponse(
        error,
      ) ??
      registryDatabaseErrorResponse(
        error,
      ) ??
      (() => {
        throw error;
      })()
    );
  }
}
