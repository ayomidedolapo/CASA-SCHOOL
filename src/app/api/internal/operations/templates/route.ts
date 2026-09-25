import {
  randomUUID,
} from "node:crypto";
import {
  neon,
} from "@neondatabase/serverless";
import {
  desc,
  sql,
} from "drizzle-orm";
import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  z,
} from "zod";

import {
  getDatabaseUrl,
} from "@/config/env";
import {
  getDb,
} from "@/db";
import {
  studentCardTemplates,
} from "@/db/schema";
import {
  refreshUnprintedCardsForTemplate,
} from "@/server/card-production/m38-lifecycle";
import {
  cardObjectExists,
} from "@/server/card-production/storage";
import {
  cardTemplateLayoutSchema,
} from "@/server/card-production/template-layout";
import {
  requireCasaCapability,
} from "@/server/internal/authorization";
import {
  casaInternalAuthErrorResponse,
  casaInternalNoStoreHeaders,
} from "@/server/internal/http";

const schema =
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
        .min(1),
    backSourceKey:
      z.string()
        .min(1),
    layout:
      cardTemplateLayoutSchema,
    activate:
      z.boolean()
        .default(false),
    supersedesTemplateId:
      z.string()
        .uuid()
        .optional()
        .nullable(),
  });

function rowsOf<T>(
  value: unknown,
): T[] {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value as T[];
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "rows" in
      value &&
    Array.isArray(
      (
        value as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      value as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

export async function GET() {
  try {
    await requireCasaCapability(
      "MASTER_TEMPLATE_ADMIN",
    );

    const db =
      getDb();
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
          layout:
            studentCardTemplates.layout,
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
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      casaInternalAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}

export async function POST(
  request:
    NextRequest,
) {
  try {
    const access =
      await requireCasaCapability(
        "MASTER_TEMPLATE_ADMIN",
      );
    const parsed =
      schema.safeParse(
        await request.json()
          .catch(
            () =>
              null,
          ),
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Check the card template fields.",
        },
        {
          status: 400,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const data =
      parsed.data;
    const db =
      getDb();
    const currentTemplate =
      rowsOf<{
        id: string;
      }>(
        await db.execute(sql`
          select id
          from student_card_templates
          where
            school_id =
              ${data.schoolId}::uuid
            and status::text in (
              'ACTIVE',
              'DRAFT'
            )
          order by
            case
              when status::text = 'ACTIVE' then 0
              else 1
            end,
            created_at desc
          limit 1
        `),
      )[0];

    if (
      currentTemplate &&
      currentTemplate.id !==
        data.supersedesTemplateId
    ) {
      return NextResponse.json(
        {
          message:
            "An ID card has already been created for this organization. Proceed to the card template below to edit the card template.",
          existingTemplateId:
            currentTemplate.id,
        },
        {
          status:
            409,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    if (
      !currentTemplate &&
      data.supersedesTemplateId
    ) {
      return NextResponse.json(
        {
          message:
            "The card template being edited is no longer the current organization template. Reload Card Templates and try again.",
        },
        {
          status:
            409,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    if (
      [
        ...data.layout
          .frontText,
        ...data.layout
          .backText,
      ].some(
        (item) =>
          item.source ===
            "CLASS" ||
          item.source ===
            "ACADEMIC_SESSION",
      )
    ) {
      return NextResponse.json(
        {
          message:
            "Class and Academic Session are digital-only and cannot be printed on the physical card.",
        },
        {
          status: 409,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const objects =
      await Promise.all([
        cardObjectExists(
          data.frontSourceKey,
        ),
        cardObjectExists(
          data.backSourceKey,
        ),
      ]);

    if (
      !objects.every(
        Boolean,
      )
    ) {
      return NextResponse.json(
        {
          message:
            "Both uploaded card sides must exist.",
        },
        {
          status: 409,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const duplicate =
      rowsOf<{
        id: string;
      }>(
        await db.execute(sql`
          select id
          from student_card_templates
          where
            school_id =
              ${data.schoolId}::uuid
            and version_label =
              ${data.versionLabel}
          limit 1
        `),
      )[0];

    if (duplicate) {
      return NextResponse.json(
        {
          message:
            "That internal template version already exists for this school. Save the edit again to create the next revision.",
        },
        {
          status: 409,
          headers:
            casaInternalNoStoreHeaders,
        },
      );
    }

    const templateId =
      randomUUID();
    const layout =
      JSON.stringify(
        data.layout,
      );
    const metadata =
      JSON.stringify({
        versionLabel:
          data.versionLabel,
        activated:
          data.activate,
      });
    const client =
      neon(
        getDatabaseUrl(),
      );

    if (
      data.activate
    ) {
      await client.transaction([
        client`
          update student_card_templates
          set
            status='RETIRED',
            activated_at=coalesce(activated_at,now()),
            retired_at=now(),
            updated_at=now()
          where
            school_id=${data.schoolId}::uuid
            and status='ACTIVE'
        `,
        client`
          insert into student_card_templates(
            id,
            school_id,
            version_label,
            status,
            front_source_key,
            back_source_key,
            layout,
            activated_at,
            retired_at,
            created_at,
            updated_at
          )
          values(
            ${templateId}::uuid,
            ${data.schoolId}::uuid,
            ${data.versionLabel},
            'ACTIVE',
            ${data.frontSourceKey},
            ${data.backSourceKey},
            ${layout}::jsonb,
            now(),
            null,
            now(),
            now()
          )
        `,
        client`
          insert into casa_internal_audit_logs(
            actor_membership_id,
            school_id,
            action,
            subject_type,
            subject_id,
            metadata,
            created_at
          )
          values(
            ${access.membership.id}::uuid,
            ${data.schoolId}::uuid,
            'MASTER_CARD_TEMPLATE_CREATED_AND_ACTIVATED',
            'CARD_TEMPLATE',
            ${templateId}::uuid,
            ${metadata}::jsonb,
            now()
          )
        `,
      ]);
    } else {
      await client.transaction([
        client`
          insert into student_card_templates(
            id,
            school_id,
            version_label,
            status,
            front_source_key,
            back_source_key,
            layout,
            activated_at,
            retired_at,
            created_at,
            updated_at
          )
          values(
            ${templateId}::uuid,
            ${data.schoolId}::uuid,
            ${data.versionLabel},
            'DRAFT',
            ${data.frontSourceKey},
            ${data.backSourceKey},
            ${layout}::jsonb,
            null,
            null,
            now(),
            now()
          )
        `,
        client`
          insert into casa_internal_audit_logs(
            actor_membership_id,
            school_id,
            action,
            subject_type,
            subject_id,
            metadata,
            created_at
          )
          values(
            ${access.membership.id}::uuid,
            ${data.schoolId}::uuid,
            'MASTER_CARD_TEMPLATE_CREATED',
            'CARD_TEMPLATE',
            ${templateId}::uuid,
            ${metadata}::jsonb,
            now()
          )
        `,
      ]);
    }

    const propagation =
      data.activate
        ? await refreshUnprintedCardsForTemplate({
            schoolId:
              data.schoolId,
            templateId,
          })
        : null;

    return NextResponse.json(
      {
        template: {
          id:
            templateId,
          schoolId:
            data.schoolId,
          versionLabel:
            data.versionLabel,
          status:
            data.activate
              ? "ACTIVE"
              : "DRAFT",
        },
        propagation,
      },
      {
        status: 201,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      casaInternalAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    console.error(
      "Card template creation failed",
      error,
    );

    return NextResponse.json(
      {
        message:
          "Card template creation failed.",
      },
      {
        status: 500,
        headers:
          casaInternalNoStoreHeaders,
      },
    );
  }
}
