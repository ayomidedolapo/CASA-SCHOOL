import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  requireSchoolAccess,
} from "@/server/auth/authorization";
import {
  requireBranchAccess,
} from "@/server/school-operations/operations";
import {
  getProgressionBatchScope,
  listProgressionDecisions,
  updateProgressionDecision,
} from "@/server/school-operations/progression";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    batchId: string;
  }>;
}

const updateSchema =
  z.object({
    decisionId:
      z.string().uuid(),
    decision:
      z.enum([
        "PENDING",
        "PROMOTED",
        "TRANSITIONED",
        "RETAINED",
        "TRANSFERRED",
        "GRADUATED",
        "WITHDRAWN",
      ]),
    targetClassArmId:
      z.string()
        .uuid()
        .nullable()
        .optional(),
    notes:
      z.string()
        .trim()
        .max(1000)
        .nullable()
        .optional(),
  });

async function scopedAccess(
  slug: string,
  batchId: string,
) {
  const schoolAccess =
    await requireSchoolAccess(
      slug,
    );

  const batch =
    await getProgressionBatchScope(
      schoolAccess.school.id,
      batchId,
    );

  if (!batch) {
    return null;
  }

  const branchAccess =
    await requireBranchAccess(
      slug,
      batch.branch_id,
    );

  return {
    batch,
    branchAccess,
  };
}

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    batchId,
  } =
    await context.params;

  try {
    const scoped =
      await scopedAccess(
        slug,
        batchId,
      );

    if (!scoped) {
      return NextResponse.json(
        {
          message:
            "Progression batch not found.",
        },
        {
          status: 404,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const decisions =
      await listProgressionDecisions({
        access:
          scoped.branchAccess.access,
        batchId,
      });

    return NextResponse.json(
      {
        batch:
          scoped.batch,
        decisions,
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

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    batchId,
  } =
    await context.params;

  try {
    const scoped =
      await scopedAccess(
        slug,
        batchId,
      );

    if (!scoped) {
      return NextResponse.json(
        {
          message:
            "Progression batch not found.",
        },
        {
          status: 404,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const body =
      updateSchema.safeParse(
        await request.json(),
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid progression decision.",
          issues:
            body.error.issues,
        },
        {
          status: 400,
          headers:
            schoolOperationsNoStoreHeaders,
        },
      );
    }

    const decision =
      await updateProgressionDecision({
        access:
          scoped.branchAccess.access,
        batchId,
        decisionId:
          body.data.decisionId,
        decision:
          body.data.decision,
        targetClassArmId:
          body.data.targetClassArmId ??
          null,
        notes:
          body.data.notes ??
          null,
      });

    return NextResponse.json(
      {
        decision,
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
