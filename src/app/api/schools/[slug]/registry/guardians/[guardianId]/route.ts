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
  guardians,
} from "@/db/schema";
import {
  registryAuthErrorResponse,
  registryDatabaseErrorResponse,
  registryNoStoreHeaders,
  requireRegistryOperator,
} from "@/server/registry/http";

export const dynamic =
  "force-dynamic";

const schema =
  z.object({
    fullName:
      z.string()
        .trim()
        .min(1)
        .max(200),
    email:
      z.string()
        .trim()
        .email()
        .max(320)
        .nullable(),
    phone:
      z.string()
        .trim()
        .regex(
          /^\+[1-9][0-9]{7,14}$/,
        )
        .nullable(),
    status:
      z.enum([
        "ACTIVE",
        "INACTIVE",
        "ARCHIVED",
      ]).optional(),
  });

export async function PATCH(
  request: NextRequest,
  context: {
    params:
      Promise<{
        slug: string;
        guardianId: string;
      }>;
  },
) {
  const {
    slug,
    guardianId,
  } =
    await context.params;

  try {
    const access =
      await requireRegistryOperator(
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
            "Check the guardian details.",
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
          guardians,
        )
        .set({
          ...parsed.data,
          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              guardians.schoolId,
              access.school.id,
            ),
            eq(
              guardians.id,
              guardianId,
            ),
          ),
        )
        .returning({
          id:
            guardians.id,
        });

    if (!row[0]) {
      return NextResponse.json(
        {
          message:
            "Guardian not found.",
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
