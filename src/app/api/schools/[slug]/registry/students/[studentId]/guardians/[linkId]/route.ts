import {
  and,
  eq,
  ne,
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
  studentGuardians,
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
    relationshipLabel:
      z.string()
        .trim()
        .min(1)
        .max(80),
    isPrimary:
      z.boolean(),
    isEmergencyContact:
      z.boolean(),
    pickupAuthorized:
      z.boolean(),
    receivesNotifications:
      z.boolean(),
  });

export async function PATCH(
  request: NextRequest,
  context: {
    params:
      Promise<{
        slug: string;
        studentId: string;
        linkId: string;
      }>;
  },
) {
  const {
    slug,
    studentId,
    linkId,
  } =
    await context.params;

  try {
    const access =
      await requireRegistryOperator(
        slug,
      );
    const parsed =
      schema.safeParse(
        await request.json()
          .catch(
            () => null,
          ),
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Check the guardian relationship details.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const db = getDb();

    if (parsed.data.isPrimary) {
      await db
        .update(
          studentGuardians,
        )
        .set({
          isPrimary: false,
          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              studentGuardians.schoolId,
              access.school.id,
            ),
            eq(
              studentGuardians.studentId,
              studentId,
            ),
            ne(
              studentGuardians.id,
              linkId,
            ),
          ),
        );
    }

    const updated =
      await db
        .update(
          studentGuardians,
        )
        .set({
          relationshipLabel:
            parsed.data.relationshipLabel,
          isPrimary:
            parsed.data.isPrimary,
          isEmergencyContact:
            parsed.data.isEmergencyContact,
          pickupAuthorized:
            parsed.data.pickupAuthorized,
          receivesNotifications:
            parsed.data.receivesNotifications,
          updatedAt:
            new Date(),
        })
        .where(
          and(
            eq(
              studentGuardians.schoolId,
              access.school.id,
            ),
            eq(
              studentGuardians.studentId,
              studentId,
            ),
            eq(
              studentGuardians.id,
              linkId,
            ),
          ),
        )
        .returning({
          id:
            studentGuardians.id,
        });

    if (!updated[0]) {
      return NextResponse.json(
        {
          message:
            "Guardian relationship not found.",
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
  } catch (error) {
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
