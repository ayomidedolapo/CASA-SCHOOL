import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  getCalendarEventScope,
  requireBranchAccess,
  requireOrganizationAdmin,
  updateCalendarEvent,
} from "@/server/school-operations/operations";
import {
  requireSchoolAccess,
} from "@/server/auth/authorization";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    eventId: string;
  }>;
}

const schema = z.object({
  kind: z.enum([
    "PUBLIC_HOLIDAY",
    "SCHOOL_BREAK",
    "BRANCH_CLOSURE",
    "SPECIAL_NON_INSTRUCTIONAL_DAY",
  ]),
  title:
    z.string().trim().min(2).max(160),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  notes:
    z.string().trim().max(1000).nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug, eventId } =
    await context.params;

  try {
    const access =
      await requireSchoolAccess(slug);
    const current =
      await getCalendarEventScope(
        access.school.id,
        eventId,
      );

    if (!current) {
      return NextResponse.json(
        {
          message:
            "Calendar event not found.",
        },
        {
          status: 404,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    if (current.branch_id) {
      await requireBranchAccess(
        slug,
        current.branch_id,
      );
    } else {
      await requireOrganizationAdmin(
        slug,
      );
    }

    if (
      current.kind ===
        "PUBLIC_HOLIDAY"
    ) {
      await requireOrganizationAdmin(
        slug,
      );
    }

    const body =
      schema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid calendar event update.",
          issues: body.error.issues,
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    if (
      body.data.kind ===
        "PUBLIC_HOLIDAY"
    ) {
      await requireOrganizationAdmin(
        slug,
      );
    }

    const event =
      await updateCalendarEvent({
        access,
        eventId,
        kind: body.data.kind,
        title: body.data.title,
        startsOn: body.data.startsOn,
        endsOn: body.data.endsOn,
        notes:
          body.data.notes ?? null,
      });

    return NextResponse.json(
      { event },
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      schoolOperationsErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
