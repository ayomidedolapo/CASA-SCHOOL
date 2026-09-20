import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import {
  getStudentCardProductionJobs,
  produceStudentCard,
} from "@/server/card-production/production";
import {
  ensureFirstStudentCardForActiveEnrollment,
} from "@/server/card-production/m38-lifecycle";
import {
  registryAuthErrorResponse,
  registryDatabaseErrorResponse,
  registryNoStoreHeaders,
  requireRegistryOperator,
} from "@/server/registry/http";

export const dynamic =
  "force-dynamic";

interface RouteContext {
  params: Promise<{
    slug: string;
    studentId: string;
  }>;
}

const bodySchema =
  z.object({
    reason:
      z.string()
        .trim()
        .min(3)
        .max(240)
        .nullable()
        .optional(),
  });

export async function GET(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
    studentId,
  } =
    await context.params;

  try {
    const access =
      await requireRegistryOperator(
        slug,
      );

    const jobs =
      await getStudentCardProductionJobs({
        schoolId:
          access.school.id,
        studentId,
        origin:
          request.nextUrl.origin,
      });

    return NextResponse.json(
      {
        jobs,
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const authResponse =
      registryAuthErrorResponse(
        error,
      );

    if (authResponse) {
      return authResponse;
    }

    const databaseResponse =
      registryDatabaseErrorResponse(
        error,
      );

    if (databaseResponse) {
      return databaseResponse;
    }

    throw error;
  }
}

export async function POST(
  request:
    NextRequest,
  context:
    RouteContext,
) {
  const {
    slug,
    studentId,
  } =
    await context.params;

  try {
    const access =
      await requireRegistryOperator(
        slug,
      );

    let raw: unknown =
      {};

    try {
      raw =
        await request.json();
    } catch {
      raw = {};
    }

    const body =
      bodySchema.safeParse(
        raw,
      );

    if (!body.success) {
      return NextResponse.json(
        {
          message:
            "Invalid card-production request.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const stepUpToken =
      request.headers.get(
        "x-casa-passkey-step-up",
      );

    if (!stepUpToken) {
      const firstCard =
        await ensureFirstStudentCardForActiveEnrollment({
          access,
          studentId,
          origin:
            request.nextUrl.origin,
        });

      if (
        firstCard.status ===
          "CREATED"
      ) {
        return NextResponse.json(
          {
            ok: true,
            automaticFirstCard:
              true,
            firstCard,
          },
          {
            status: 201,
            headers:
              registryNoStoreHeaders,
          },
        );
      }

      if (
        firstCard.status ===
          "DEFERRED_NO_TEMPLATE"
      ) {
        return NextResponse.json(
          {
            message:
              "An active card template is required before CASA can create the first digital card.",
            code:
              "ACTIVE_CARD_TEMPLATE_REQUIRED",
          },
          {
            status: 409,
            headers:
              registryNoStoreHeaders,
          },
        );
      }

      if (
        firstCard.status ===
          "DEFERRED_INCOMPLETE_CARD_DATA"
      ) {
        return NextResponse.json(
          {
            message:
              "Complete the student name, sex and active enrollment details before CASA creates the first digital card.",
            code:
              "CARD_VISIBLE_DATA_INCOMPLETE",
          },
          {
            status: 422,
            headers:
              registryNoStoreHeaders,
          },
        );
      }

      if (
        firstCard.status ===
          "NO_ACTIVE_ENROLLMENT"
      ) {
        return NextResponse.json(
          {
            message:
              "Create an active enrollment before CASA creates the first digital card.",
            code:
              "ACTIVE_ENROLLMENT_REQUIRED",
          },
          {
            status: 409,
            headers:
              registryNoStoreHeaders,
          },
        );
      }

      return NextResponse.json(
        {
          message:
            "A current student card already exists or the card state changed. Reload before retrying.",
          code:
            "CARD_ALREADY_PRESENT",
        },
        {
          status: 409,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const result =
      await produceStudentCard({
        access,
        studentId,
        stepUpToken,
        reason:
          body.data.reason ??
          null,
        origin:
          request.nextUrl.origin,
      });

    if (!result.ok) {
      return NextResponse.json(
        {
          message:
            "Student card could not be produced.",
          code:
            result.code,
          requiredAction:
            "requiredAction" in
              result
              ? result.requiredAction
              : undefined,
        },
        {
          status:
            result.status,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    return NextResponse.json(
      result,
      {
        status: 201,
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const authResponse =
      registryAuthErrorResponse(
        error,
      );

    if (authResponse) {
      return authResponse;
    }

    const databaseResponse =
      registryDatabaseErrorResponse(
        error,
      );

    if (databaseResponse) {
      return databaseResponse;
    }

    throw error;
  }
}