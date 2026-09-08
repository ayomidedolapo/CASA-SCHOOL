import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  createCalendarEvent,
  hasOrganizationAdminAuthority,
  listCalendarEvents,
  requireBranchAccess,
} from "@/server/school-operations/operations";
import {
  requireSchoolAccess,
  SchoolAccessDeniedError,
} from "@/server/auth/authorization";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

const createSchema = z.object({
  branchId:
    z.string().uuid().nullable().optional(),
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
  academicSessionId:
    z.string().uuid().nullable().optional(),
  academicTermId:
    z.string().uuid().nullable().optional(),
  notes:
    z.string().trim().max(1000).nullable().optional(),
});

export async function GET(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } = await context.params;

  try {
    const access =
      await requireSchoolAccess(slug);
    const branchId =
      request.nextUrl.searchParams.get(
        "branchId",
      );
    const startsOn =
      request.nextUrl.searchParams.get(
        "startsOn",
      );
    const endsOn =
      request.nextUrl.searchParams.get(
        "endsOn",
      );

    if (
      !startsOn ||
      !endsOn ||
      !z.string().date().safeParse(
        startsOn,
      ).success ||
      !z.string().date().safeParse(
        endsOn,
      ).success
    ) {
      return NextResponse.json(
        {
          message:
            "Valid startsOn and endsOn are required.",
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    if (branchId) {
      await requireBranchAccess(
        slug,
        branchId,
      );
    } else if (
      !hasOrganizationAdminAuthority(access)
    ) {
      throw new SchoolAccessDeniedError();
    }

    const events =
      await listCalendarEvents({
        schoolId: access.school.id,
        branchId,
        startsOn,
        endsOn,
      });

    return NextResponse.json(
      { events },
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

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { slug } = await context.params;

  try {
    const access =
      await requireSchoolAccess(slug);
    const body =
      createSchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid calendar event.",
          issues: body.error.issues,
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const branchId =
      body.data.branchId ?? null;

    if (branchId) {
      await requireBranchAccess(
        slug,
        branchId,
      );
    } else if (
      !hasOrganizationAdminAuthority(access)
    ) {
      throw new SchoolAccessDeniedError();
    }

    if (
      body.data.kind ===
        "PUBLIC_HOLIDAY" &&
      !hasOrganizationAdminAuthority(access)
    ) {
      throw new SchoolAccessDeniedError();
    }

    const event =
      await createCalendarEvent({
        access,
        branchId,
        kind: body.data.kind,
        title: body.data.title,
        startsOn: body.data.startsOn,
        endsOn: body.data.endsOn,
        academicSessionId:
          body.data.academicSessionId ??
          null,
        academicTermId:
          body.data.academicTermId ??
          null,
        notes:
          body.data.notes ?? null,
      });

    return NextResponse.json(
      { event },
      {
        status: 201,
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
