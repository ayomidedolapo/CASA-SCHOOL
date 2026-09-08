import {
  NextRequest,
  NextResponse,
} from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  registryAuthErrorResponse,
  registryNoStoreHeaders,
  requireRegistryAdmin,
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

function rowsOf<T>(
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray(
      (
        result as {
          rows?: unknown;
        }
      ).rows,
    )
  ) {
    return (
      result as {
        rows: T[];
      }
    ).rows;
  }

  return [];
}

const bodySchema =
  z.object({
    arrivalMethod:
      z.enum([
        "SCHOOL_BUS",
        "INDEPENDENT",
      ]),
    effectiveFrom:
      z.string()
        .regex(
          /^\d{4}-\d{2}-\d{2}$/,
        ),
    reason:
      z.string()
        .trim()
        .min(1)
        .max(240)
        .optional()
        .nullable(),
  });

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const {
    slug,
    studentId,
  } = await context.params;

  try {
    const access =
      await requireRegistryOperator(
        slug,
      );
    const db = getDb();

    const result =
      await db.execute(sql`
        select
          assignment.id,
          assignment.arrival_method,
          assignment.effective_from::text
            as effective_from,
          assignment.effective_to::text
            as effective_to,
          assignment.reason,
          assignment.assigned_by_membership_id,
          assignment.created_at
        from student_arrival_method_assignments
          assignment
        join students
          student
          on student.school_id =
             assignment.school_id
         and student.id =
             assignment.student_id
        where
          assignment.school_id =
            ${access.school.id}::uuid
          and assignment.student_id =
            ${studentId}::uuid
        order by
          assignment.effective_from desc,
          assignment.created_at desc
      `);

    const history =
      rowsOf<Record<
        string,
        unknown
      >>(
        result,
      );

    return NextResponse.json(
      {
        current:
          history.find(
            (item) => {
              const today =
                new Date()
                  .toISOString()
                  .slice(0, 10);
              return (
                String(
                  item.effective_from,
                ) <= today &&
                (
                  item.effective_to ===
                    null ||
                  String(
                    item.effective_to,
                  ) >= today
                )
              );
            },
          ) ??
          null,
        history,
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      registryAuthErrorResponse(
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
    studentId,
  } = await context.params;

  try {
    const access =
      await requireRegistryAdmin(
        slug,
      );

    let raw: unknown;

    try {
      raw =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          message:
            "Invalid arrival-method request.",
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const parsed =
      bodySchema.safeParse(
        raw,
      );

    if (!parsed.success) {
      return NextResponse.json(
        {
          message:
            "Invalid arrival-method assignment.",
          issues:
            parsed.error.issues,
        },
        {
          status: 400,
          headers:
            registryNoStoreHeaders,
        },
      );
    }

    const db = getDb();
    const input =
      parsed.data;

    const result =
      await db.execute(sql`
        with student_scope as (
          select id
          from students
          where
            school_id =
              ${access.school.id}::uuid
            and id =
              ${studentId}::uuid
        ),
        future_assignment as (
          select 1
          from student_arrival_method_assignments
          where
            school_id =
              ${access.school.id}::uuid
            and student_id =
              ${studentId}::uuid
            and effective_from >
              ${input.effectiveFrom}::date
          limit 1
        ),
        closed_previous as (
          update student_arrival_method_assignments
          set
            effective_to =
              ${input.effectiveFrom}::date -
              1,
            updated_at =
              now()
          where
            school_id =
              ${access.school.id}::uuid
            and student_id =
              ${studentId}::uuid
            and effective_from <
              ${input.effectiveFrom}::date
            and (
              effective_to is null
              or effective_to >=
                 ${input.effectiveFrom}::date
            )
            and exists (
              select 1
              from student_scope
            )
            and not exists (
              select 1
              from future_assignment
            )
          returning id
        )
        insert into student_arrival_method_assignments (
          school_id,
          student_id,
          arrival_method,
          effective_from,
          effective_to,
          assigned_by_membership_id,
          reason,
          created_at,
          updated_at
        )
        select
          ${access.school.id}::uuid,
          student_scope.id,
          ${input.arrivalMethod},
          ${input.effectiveFrom}::date,
          null,
          ${access.membership.id}::uuid,
          ${input.reason ?? null},
          now(),
          now()
        from student_scope
        where not exists (
          select 1
          from future_assignment
        )
        on conflict (
          school_id,
          student_id,
          effective_from
        )
        do update set
          arrival_method =
            excluded.arrival_method,
          assigned_by_membership_id =
            excluded.assigned_by_membership_id,
          reason =
            excluded.reason,
          updated_at =
            now()
        returning
          id,
          arrival_method,
          effective_from::text
            as effective_from,
          effective_to::text
            as effective_to,
          reason,
          assigned_by_membership_id
      `);

    const assignment =
      rowsOf<Record<
        string,
        unknown
      >>(
        result,
      )[0];

    if (!assignment) {
      return NextResponse.json(
        {
          message:
            "Student not found, or a later effective-dated arrival assignment already exists.",
          code:
            "ARRIVAL_METHOD_EFFECTIVE_DATE_CONFLICT",
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
        assignment,
      },
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const response =
      registryAuthErrorResponse(
        error,
      );

    if (response) {
      return response;
    }

    throw error;
  }
}
