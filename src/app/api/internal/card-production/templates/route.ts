import {
  desc,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  studentCardTemplates,
} from "@/db/schema";
import {
  requireInternalCardProduction,
} from "@/server/card-production/internal-auth";
import {
  cardObjectExists,
} from "@/server/card-production/storage";
import {
  cardTemplateLayoutSchema,
} from "@/server/card-production/template-layout";

export const dynamic =
  "force-dynamic";

const createSchema =
  z.object({
    schoolId:
      z.string()
        .uuid(),
    versionLabel:
      z.string()
        .trim()
        .min(1)
        .max(80),
    frontSourceKey:
      z.string()
        .trim()
        .min(1)
        .max(1000),
    backSourceKey:
      z.string()
        .trim()
        .min(1)
        .max(1000),
    layout:
      cardTemplateLayoutSchema,
    notes:
      z.string()
        .trim()
        .min(1)
        .max(240)
        .nullable()
        .optional(),
  });

export async function GET(
  request:
    NextRequest,
) {
  const auth =
    requireInternalCardProduction(
      request,
    );

  if (!auth.ok) {
    return auth.response;
  }

  const db = getDb();

  const templates =
    await db
      .select({
        id:
          studentCardTemplates.id,
        schoolId:
          studentCardTemplates.schoolId,
        versionLabel:
          studentCardTemplates.versionLabel,
        status:
          studentCardTemplates.status,
        frontSourceKey:
          studentCardTemplates.frontSourceKey,
        backSourceKey:
          studentCardTemplates.backSourceKey,
        layout:
          studentCardTemplates.layout,
        notes:
          studentCardTemplates.notes,
        activatedAt:
          studentCardTemplates.activatedAt,
        retiredAt:
          studentCardTemplates.retiredAt,
        createdAt:
          studentCardTemplates.createdAt,
      })
      .from(
        studentCardTemplates,
      )
      .orderBy(
        desc(
          studentCardTemplates.createdAt,
        ),
      );

  return NextResponse.json(
    {
      templates,
    },
    {
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}

export async function POST(
  request:
    NextRequest,
) {
  const auth =
    requireInternalCardProduction(
      request,
    );

  if (!auth.ok) {
    return auth.response;
  }

  let raw: unknown;

  try {
    raw =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        message:
          "Invalid template request.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const body =
    createSchema.safeParse(
      raw,
    );

  if (!body.success) {
    return NextResponse.json(
      {
        message:
          "Invalid card template.",
        issues:
          body.error.issues.map(
            (issue) => ({
              path:
                issue.path.join(
                  ".",
                ),
              message:
                issue.message,
            }),
          ),
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const [
    frontExists,
    backExists,
  ] =
    await Promise.all([
      cardObjectExists(
        body.data
          .frontSourceKey,
      ),
      cardObjectExists(
        body.data
          .backSourceKey,
      ),
    ]);

  if (
    !frontExists ||
    !backExists
  ) {
    return NextResponse.json(
      {
        message:
          "Both private template source assets must exist before template registration.",
        code:
          "CARD_TEMPLATE_SOURCE_MISSING",
      },
      {
        status: 409,
        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  const db = getDb();

  const rows =
    await db
      .insert(
        studentCardTemplates,
      )
      .values({
        schoolId:
          body.data.schoolId,
        versionLabel:
          body.data
            .versionLabel,
        status:
          "DRAFT",
        frontSourceKey:
          body.data
            .frontSourceKey,
        backSourceKey:
          body.data
            .backSourceKey,
        layout:
          body.data.layout,
        notes:
          body.data.notes ??
          null,
      })
      .returning({
        id:
          studentCardTemplates.id,
        schoolId:
          studentCardTemplates.schoolId,
        versionLabel:
          studentCardTemplates.versionLabel,
        status:
          studentCardTemplates.status,
        createdAt:
          studentCardTemplates.createdAt,
      });

  return NextResponse.json(
    {
      template:
        rows[0],
    },
    {
      status: 201,
      headers: {
        "Cache-Control":
          "no-store",
      },
    },
  );
}