import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";

import {
  getDb,
} from "@/db";
import {
  createBranch,
  requireOrganizationAdmin,
} from "@/server/school-operations/operations";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic = "force-dynamic";

const createSchema =
  z.object({
    name:
      z.string()
        .trim()
        .min(1)
        .max(120),
    code:
      z.string()
        .trim()
        .toUpperCase()
        .regex(
          /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
        )
        .max(32),
    address:
      z.string()
        .trim()
        .max(1000)
        .nullable()
        .optional(),
    copyHeadquartersClassArms:
      z.boolean()
        .optional(),
  });

function rowsOf<T>(
  value: unknown,
): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (
    value &&
    typeof value === "object" &&
    "rows" in value &&
    Array.isArray(
      (value as { rows?: unknown }).rows,
    )
  ) {
    return (value as { rows: T[] }).rows;
  }

  return [];
}

export async function GET(
  _request: Request,
  context: {
    params:
      Promise<{
        slug: string;
      }>;
  },
) {
  const { slug } =
    await context.params;

  try {
    const access =
      await requireOrganizationAdmin(
        slug,
      );

    const result =
      await getDb()
        .execute(sql`
          select
            id,
            name,
            code,
            address,
            is_headquarters,
            status::text as status
          from school_branches
          where
            school_id =
              ${access.school.id}::uuid
          order by
            is_headquarters desc,
            name asc
        `);

    return NextResponse.json(
      {
        branches:
          rowsOf(result),
      },
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      schoolOperationsErrorResponse(
        error,
      );
    if (response) {
      return response;
    }
    throw error;
  }
}

export async function POST(
  request: NextRequest,
  context: {
    params:
      Promise<{
        slug: string;
      }>;
  },
) {
  const { slug } =
    await context.params;

  try {
    const access =
      await requireOrganizationAdmin(
        slug,
      );
    const parsed =
      createSchema.safeParse(
        await request.json()
          .catch(() => null),
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Check the branch name, code and address.",
          issues:
            parsed.error.issues,
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const branch =
      await createBranch({
        access,
        name:
          parsed.data.name,
        code:
          parsed.data.code,
        address:
          parsed.data.address ??
          null,
      });

    return NextResponse.json(
      {
        branch,
      },
      {
        status: 201,
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      schoolOperationsErrorResponse(
        error,
      );
    if (response) {
      return response;
    }
    throw error;
  }
}
