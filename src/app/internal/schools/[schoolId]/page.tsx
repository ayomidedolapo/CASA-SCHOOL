import {
  sql,
} from "drizzle-orm";
import {
  redirect,
} from "next/navigation";

import {
  getDb,
} from "@/db";
import {
  CasaInternalAccessDeniedError,
  CasaInternalSchoolScopeError,
  isAuthRequiredError,
  requireCasaInternalSchoolManagementAccess,
} from "@/server/internal/authorization";

import InternalShell from "../../internal-shell";
import SchoolDetailClient from "./school-detail-client";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

export default async function Page({
  params,
}: {
  params: Promise<{
    schoolId: string;
  }>;
}) {
  const {
    schoolId,
  } = await params;

  let access: Awaited<
    ReturnType<
      typeof requireCasaInternalSchoolManagementAccess
    >
  >;

  try {
    access =
      await requireCasaInternalSchoolManagementAccess(
        schoolId,
      );
  } catch (error) {
    if (
      isAuthRequiredError(
        error,
      )
    ) {
      redirect(
        "/internal/login",
      );
    }

    if (
      error instanceof
        CasaInternalAccessDeniedError ||
      error instanceof
        CasaInternalSchoolScopeError
    ) {
      redirect(
        "/internal/schools",
      );
    }

    throw error;
  }

  const db =
    getDb();

  const statusRow =
    rowsOf<{
      status: string;
    }>(
      await db.execute(
        sql`
          select
            status::text as status
          from schools
          where id = ${schoolId}::uuid
        `,
      ),
    )[0];

  const branches =
    rowsOf<{
      id: string;
      name: string;
      code: string;
      is_headquarters: boolean;
      status: string;
      address: string | null;
      student_count: number;
      enrolled_count: number;
    }>(
      await db.execute(
        sql`
          select
            b.id,
            b.name,
            b.code,
            b.is_headquarters,
            b.status::text as status,
            b.address,
            (
              select count(*)::int
              from students s
              where s.school_id = b.school_id
                and s.home_branch_id = b.id
                and s.status = 'ACTIVE'
            ) as student_count,
            (
              select count(distinct e.student_id)::int
              from student_enrollments e
              join school_branch_class_arms ba
                on ba.school_id = e.school_id
               and ba.class_arm_id = e.class_arm_id
              where e.school_id = b.school_id
                and ba.branch_id = b.id
                and e.status = 'ACTIVE'
            ) as enrolled_count
          from school_branches b
          where b.school_id = ${schoolId}::uuid
          order by b.is_headquarters desc, b.name
        `,
      ),
    );

  const owners =
    rowsOf<{
      full_name: string;
      email: string | null;
      phone: string | null;
    }>(
      await db.execute(
        sql`
          select
            u.full_name,
            u.email,
            u.phone
          from school_memberships m
          join school_membership_roles r
            on r.school_id = m.school_id
           and r.membership_id = m.id
          join users u
            on u.id = m.user_id
          where m.school_id = ${schoolId}::uuid
            and m.status = 'ACTIVE'
            and r.role = 'OWNER'
          order by u.full_name
        `,
      ),
    );

  const pendingCards =
    rowsOf<{
      card_id: string;
      student_id: string;
      student_name: string;
      casa_student_id: string;
      serial_number: string;
    }>(
      await db.execute(
        sql`
          select
            c.id as card_id,
            c.student_id,
            concat_ws(
              ' ',
              s.first_name,
              s.middle_name,
              s.last_name
            ) as student_name,
            s.casa_student_id,
            c.serial_number
          from student_identity_cards c
          join students s
            on s.school_id = c.school_id
           and s.id = c.student_id
          where c.school_id = ${schoolId}::uuid
            and c.status = 'READY_FOR_ACTIVATION'::student_identity_card_status
          order by c.issued_at asc
          limit 100
        `,
      ),
    );

  const metrics =
    rowsOf<{
      students: number;
      ready_cards: number;
      active_cards: number;
    }>(
      await db.execute(
        sql`
          select
            (
              select count(*)::int
              from students
              where school_id = ${schoolId}::uuid
                and status = 'ACTIVE'
            ) as students,
            (
              select count(*)::int
              from student_identity_cards
              where school_id = ${schoolId}::uuid
                and status = 'READY_FOR_ACTIVATION'
            ) as ready_cards,
            (
              select count(*)::int
              from student_identity_cards
              where school_id = ${schoolId}::uuid
                and status = 'ACTIVE'
            ) as active_cards
        `,
      ),
    )[0] ?? {
      students: 0,
      ready_cards: 0,
      active_cards: 0,
    };

  let canManageStructure =
    access.membership.role ===
    "CASA_SUPER_ADMIN";

  if (
    !canManageStructure
  ) {
    canManageStructure =
      rowsOf(
        await db.execute(
          sql`
            select 1
            from casa_internal_capability_grants
            where membership_id = ${access.membership.id}::uuid
              and capability = 'ORGANIZATION_RESTRUCTURE'
              and revoked_at is null
            limit 1
          `,
        ),
      ).length === 1;
  }

  return (
    <InternalShell
      actorName={
        access.session
          .fullName
      }
      active="schools"
      role={
        access.membership
          .role
      }
    >
      <header className="border-b border-black/15 bg-white px-5 py-7 sm:px-8 lg:px-10">
        <p className="casa-kicker text-black/45">
          CASA / Schools /
          Organization
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">
          {
            access.school
              .name
          }
        </h1>
      </header>

      <SchoolDetailClient
        branches={
          branches
        }
        canManageStructure={
          canManageStructure
        }
        isSuperAdmin={
          access.membership
            .role ===
          "CASA_SUPER_ADMIN"
        }
        metrics={
          metrics
        }
        owners={
          owners
        }
        pendingCards={
          pendingCards
        }
        school={{
          ...access.school,
          status:
            statusRow?.status ??
            "ACTIVE",
        }}
      />
    </InternalShell>
  );
}
