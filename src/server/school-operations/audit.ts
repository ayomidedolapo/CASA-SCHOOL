import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  requireSchoolAccess,
  SchoolAccessDeniedError,
} from "@/server/auth/authorization";
import {
  hasOrganizationAdminAuthority,
} from "./operations";

function rowsOf<T>(
  result: unknown,
): T[] {
  if (
    Array.isArray(
      result,
    )
  ) {
    return result as T[];
  }

  if (
    result &&
    typeof result ===
      "object" &&
    "rows" in
      result &&
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

export interface SchoolAuditEvent {
  id: string;
  occurredAt: string;
  branchId:
    string | null;
  branchName:
    string | null;
  actorName: string;
  actorEmail:
    string | null;
  category: string;
  action: string;
  subject: string;
  detail:
    string | null;
}

function normalizeEvents(
  result: unknown,
  category: string,
): SchoolAuditEvent[] {
  return rowsOf<
    Record<
      string,
      unknown
    >
  >(
    result,
  ).flatMap(
    (row) => {
      if (
        !row.id ||
        !row.occurred_at
      ) {
        return [];
      }

      return [
        {
          id:
            String(
              row.id,
            ),
          occurredAt:
            row.occurred_at instanceof
              Date
              ? row.occurred_at.toISOString()
              : String(
                  row.occurred_at,
                ),
          branchId:
            row.branch_id
              ? String(
                  row.branch_id,
                )
              : null,
          branchName:
            row.branch_name
              ? String(
                  row.branch_name,
                )
              : null,
          actorName:
            row.actor_name
              ? String(
                  row.actor_name,
                )
              : "System",
          actorEmail:
            row.actor_email
              ? String(
                  row.actor_email,
                )
              : null,
          category,
          action:
            String(
              row.action ??
              "UPDATED",
            ),
          subject:
            String(
              row.subject ??
              "CASA record",
            ),
          detail:
            row.detail
              ? String(
                  row.detail,
                )
              : null,
        },
      ];
    },
  );
}

export async function resolveSchoolAuditScope(
  slug: string,
) {
  const access =
    await requireSchoolAccess(
      slug,
    );
  const db =
    getDb();

  const branches =
    rowsOf<{
      id: string;
      name: string;
    }>(
      await db.execute(sql`
        select
          branch.id::text as id,
          branch.name
        from school_branch_admin_assignments
          assignment
        join school_branches
          branch
          on branch.school_id =
             assignment.school_id
         and branch.id =
             assignment.branch_id
        where
          assignment.school_id =
            ${access.school.id}::uuid
          and assignment.membership_id =
            ${access.membership.id}::uuid
          and assignment.is_active =
            true
          and branch.status =
            'ACTIVE'::school_branch_status
        order by
          branch.name asc
      `),
    );

  if (
    branches.length >
      0
  ) {
    return {
      access,
      organizationWide:
        false,
      branches,
    };
  }

  if (
    hasOrganizationAdminAuthority(
      access,
    )
  ) {
    const organizationBranches =
      rowsOf<{
        id: string;
        name: string;
      }>(
        await db.execute(sql`
          select
            id::text as id,
            name
          from school_branches
          where
            school_id =
              ${access.school.id}::uuid
          order by
            is_headquarters desc,
            name asc
        `),
      );

    return {
      access,
      organizationWide:
        true,
      branches:
        organizationBranches,
    };
  }

  throw new SchoolAccessDeniedError();
}

export async function listSchoolAuditEvents(
  input: {
    slug: string;
    limit?: number;
  },
) {
  const scope =
    await resolveSchoolAuditScope(
      input.slug,
    );
  const db =
    getDb();
  const limit =
    Math.min(
      300,
      Math.max(
        25,
        input.limit ??
          200,
      ),
    );
  const schoolId =
    scope.access.school.id;
  const actorMembershipId =
    scope.access.membership.id;
  const organizationWide =
    scope.organizationWide;

  const branchScope =
    sql`(
      ${organizationWide}
      or exists (
        select 1
        from school_branch_admin_assignments
          audit_assignment
        where
          audit_assignment.school_id =
            ${schoolId}::uuid
          and audit_assignment.membership_id =
            ${actorMembershipId}::uuid
          and audit_assignment.is_active =
            true
          and audit_assignment.branch_id =
            audit_branch_id
      )
    )`;

  const [
    structureResult,
    terminalResult,
    biometricResult,
    attendanceOpenResult,
    attendanceCloseResult,
    progressionBatchResult,
    progressionDecisionResult,
  ] =
    await Promise.all([
      db.execute(sql`
        select
          concat(
            'structure:',
            event.id::text
          ) as id,
          event.created_at
            as occurred_at,
          event.branch_id::text
            as branch_id,
          branch.name
            as branch_name,
          case
            when actor.full_name
              is not null
              then actor.full_name
            when event.actor_kind =
              'CASA_INTERNAL'
              then 'CASA Operations'
            else 'System'
          end as actor_name,
          actor.email
            as actor_email,
          event.event_type
            as action,
          'School structure'
            as subject,
          event.reason
            as detail
        from school_structure_change_events
          event
        left join school_branches
          branch
          on branch.school_id =
             event.school_id
         and branch.id =
             event.branch_id
        left join school_memberships
          membership
          on membership.school_id =
             event.school_id
         and membership.id =
             event.actor_school_membership_id
        left join users
          actor
          on actor.id =
             membership.user_id
        where
          event.school_id =
            ${schoolId}::uuid
          and (
            ${organizationWide}
            or event.branch_id in (
              select assignment.branch_id
              from school_branch_admin_assignments assignment
              where
                assignment.school_id =
                  ${schoolId}::uuid
                and assignment.membership_id =
                  ${actorMembershipId}::uuid
                and assignment.is_active =
                  true
            )
          )
        order by
          event.created_at desc
        limit ${limit}
      `),
      db.execute(sql`
        select
          concat(
            'terminal:',
            event.id::text
          ) as id,
          event.created_at
            as occurred_at,
          mapping.branch_id::text
            as branch_id,
          branch.name
            as branch_name,
          coalesce(
            actor.full_name,
            'System'
          ) as actor_name,
          actor.email
            as actor_email,
          event.event_type::text
            as action,
          terminal.name
            as subject,
          coalesce(
            event.reason,
            concat(
              'Credential version ',
              event.credential_version::text
            )
          ) as detail
        from attendance_terminal_events
          event
        join attendance_terminals
          terminal
          on terminal.school_id =
             event.school_id
         and terminal.id =
             event.terminal_id
        left join school_branch_terminals
          mapping
          on mapping.school_id =
             event.school_id
         and mapping.terminal_id =
             event.terminal_id
        left join school_branches
          branch
          on branch.school_id =
             mapping.school_id
         and branch.id =
             mapping.branch_id
        left join school_memberships
          membership
          on membership.school_id =
             event.school_id
         and membership.id =
             event.actor_membership_id
        left join users
          actor
          on actor.id =
             membership.user_id
        where
          event.school_id =
            ${schoolId}::uuid
          and (
            ${organizationWide}
            or mapping.branch_id in (
              select assignment.branch_id
              from school_branch_admin_assignments assignment
              where
                assignment.school_id =
                  ${schoolId}::uuid
                and assignment.membership_id =
                  ${actorMembershipId}::uuid
                and assignment.is_active =
                  true
            )
          )
        order by
          event.created_at desc
        limit ${limit}
      `),
      db.execute(sql`
        select
          concat(
            'biometric:',
            event.id::text
          ) as id,
          event.created_at
            as occurred_at,
          student.home_branch_id::text
            as branch_id,
          branch.name
            as branch_name,
          case
            when actor.full_name
              is not null
              then actor.full_name
            when event.actor_internal_membership_id
              is not null
              then 'CASA Operations'
            else 'System'
          end as actor_name,
          actor.email
            as actor_email,
          event.event_type::text
            as action,
          concat_ws(
            ' ',
            student.first_name,
            student.middle_name,
            student.last_name
          ) as subject,
          event.reason
            as detail
        from student_biometric_profile_events
          event
        join students
          student
          on student.school_id =
             event.school_id
         and student.id =
             event.student_id
        left join school_branches
          branch
          on branch.school_id =
             student.school_id
         and branch.id =
             student.home_branch_id
        left join school_memberships
          membership
          on membership.school_id =
             event.school_id
         and membership.id =
             event.actor_membership_id
        left join users
          actor
          on actor.id =
             membership.user_id
        where
          event.school_id =
            ${schoolId}::uuid
          and (
            ${organizationWide}
            or student.home_branch_id in (
              select assignment.branch_id
              from school_branch_admin_assignments assignment
              where
                assignment.school_id =
                  ${schoolId}::uuid
                and assignment.membership_id =
                  ${actorMembershipId}::uuid
                and assignment.is_active =
                  true
            )
          )
        order by
          event.created_at desc
        limit ${limit}
      `),
      db.execute(sql`
        select
          concat(
            'attendance-open:',
            branch_session.id::text
          ) as id,
          branch_session.opened_at
            as occurred_at,
          branch_session.branch_id::text
            as branch_id,
          branch.name
            as branch_name,
          coalesce(
            actor.full_name,
            'System'
          ) as actor_name,
          actor.email
            as actor_email,
          'ATTENDANCE_OPENED'
            as action,
          concat(
            'Attendance · ',
            session.attendance_date::text
          ) as subject,
          branch_session.mode::text
            as detail
        from attendance_branch_sessions
          branch_session
        join attendance_sessions
          session
          on session.school_id =
             branch_session.school_id
         and session.id =
             branch_session.session_id
        join school_branches
          branch
          on branch.school_id =
             branch_session.school_id
         and branch.id =
             branch_session.branch_id
        left join school_memberships
          membership
          on membership.school_id =
             branch_session.school_id
         and membership.id =
             branch_session.opened_by_membership_id
        left join users
          actor
          on actor.id =
             membership.user_id
        where
          branch_session.school_id =
            ${schoolId}::uuid
          and branch_session.opened_at
            is not null
          and (
            ${organizationWide}
            or branch_session.branch_id in (
              select assignment.branch_id
              from school_branch_admin_assignments assignment
              where
                assignment.school_id =
                  ${schoolId}::uuid
                and assignment.membership_id =
                  ${actorMembershipId}::uuid
                and assignment.is_active =
                  true
            )
          )
        order by
          branch_session.opened_at desc
        limit ${limit}
      `),
      db.execute(sql`
        select
          concat(
            'attendance-close:',
            branch_session.id::text
          ) as id,
          branch_session.closed_at
            as occurred_at,
          branch_session.branch_id::text
            as branch_id,
          branch.name
            as branch_name,
          coalesce(
            actor.full_name,
            'System'
          ) as actor_name,
          actor.email
            as actor_email,
          'ATTENDANCE_CLOSED'
            as action,
          concat(
            'Attendance · ',
            session.attendance_date::text
          ) as subject,
          branch_session.last_reason
            as detail
        from attendance_branch_sessions
          branch_session
        join attendance_sessions
          session
          on session.school_id =
             branch_session.school_id
         and session.id =
             branch_session.session_id
        join school_branches
          branch
          on branch.school_id =
             branch_session.school_id
         and branch.id =
             branch_session.branch_id
        left join school_memberships
          membership
          on membership.school_id =
             branch_session.school_id
         and membership.id =
             branch_session.closed_by_membership_id
        left join users
          actor
          on actor.id =
             membership.user_id
        where
          branch_session.school_id =
            ${schoolId}::uuid
          and branch_session.closed_at
            is not null
          and (
            ${organizationWide}
            or branch_session.branch_id in (
              select assignment.branch_id
              from school_branch_admin_assignments assignment
              where
                assignment.school_id =
                  ${schoolId}::uuid
                and assignment.membership_id =
                  ${actorMembershipId}::uuid
                and assignment.is_active =
                  true
            )
          )
        order by
          branch_session.closed_at desc
        limit ${limit}
      `),
      db.execute(sql`
        select
          concat(
            'progression-batch:',
            batch.id::text,
            ':',
            batch.status::text
          ) as id,
          coalesce(
            batch.confirmed_at,
            batch.created_at
          ) as occurred_at,
          batch.branch_id::text
            as branch_id,
          branch.name
            as branch_name,
          coalesce(
            actor.full_name,
            'System'
          ) as actor_name,
          actor.email
            as actor_email,
          case
            when batch.status::text =
              'CONFIRMED'
              then
                'PROGRESSION_CONFIRMED'
            else
              'PROGRESSION_BATCH_CREATED'
          end as action,
          concat(
            source_session.name,
            ' -> ',
            target_session.name
          ) as subject,
          null::text
            as detail
        from student_progression_batches
          batch
        join school_branches
          branch
          on branch.school_id =
             batch.school_id
         and branch.id =
             batch.branch_id
        join academic_sessions
          source_session
          on source_session.school_id =
             batch.school_id
         and source_session.id =
             batch.source_session_id
        join academic_sessions
          target_session
          on target_session.school_id =
             batch.school_id
         and target_session.id =
             batch.target_session_id
        left join school_memberships
          membership
          on membership.school_id =
             batch.school_id
         and membership.id =
             coalesce(
               batch.confirmed_by_membership_id,
               batch.created_by_membership_id
             )
        left join users
          actor
          on actor.id =
             membership.user_id
        where
          batch.school_id =
            ${schoolId}::uuid
          and (
            ${organizationWide}
            or batch.branch_id in (
              select assignment.branch_id
              from school_branch_admin_assignments assignment
              where
                assignment.school_id =
                  ${schoolId}::uuid
                and assignment.membership_id =
                  ${actorMembershipId}::uuid
                and assignment.is_active =
                  true
            )
          )
        order by
          coalesce(
            batch.confirmed_at,
            batch.created_at
          ) desc
        limit ${limit}
      `),
      db.execute(sql`
        select
          concat(
            'progression-decision:',
            decision.id::text
          ) as id,
          decision.updated_at
            as occurred_at,
          batch.branch_id::text
            as branch_id,
          branch.name
            as branch_name,
          coalesce(
            actor.full_name,
            'System'
          ) as actor_name,
          actor.email
            as actor_email,
          concat(
            'PROGRESSION_',
            decision.decision::text
          ) as action,
          concat_ws(
            ' ',
            student.first_name,
            student.middle_name,
            student.last_name
          ) as subject,
          decision.notes
            as detail
        from student_progression_decisions
          decision
        join student_progression_batches
          batch
          on batch.school_id =
             decision.school_id
         and batch.id =
             decision.batch_id
        join school_branches
          branch
          on branch.school_id =
             batch.school_id
         and branch.id =
             batch.branch_id
        join students
          student
          on student.school_id =
             decision.school_id
         and student.id =
             decision.student_id
        left join school_memberships
          membership
          on membership.school_id =
             decision.school_id
         and membership.id =
             decision.updated_by_membership_id
        left join users
          actor
          on actor.id =
             membership.user_id
        where
          decision.school_id =
            ${schoolId}::uuid
          and decision.updated_by_membership_id
            is not null
          and (
            ${organizationWide}
            or batch.branch_id in (
              select assignment.branch_id
              from school_branch_admin_assignments assignment
              where
                assignment.school_id =
                  ${schoolId}::uuid
                and assignment.membership_id =
                  ${actorMembershipId}::uuid
                and assignment.is_active =
                  true
            )
          )
        order by
          decision.updated_at desc
        limit ${limit}
      `),
    ]);

  const events =
    [
      ...normalizeEvents(
        structureResult,
        "Structure",
      ),
      ...normalizeEvents(
        terminalResult,
        "Scanner",
      ),
      ...normalizeEvents(
        biometricResult,
        "Biometric",
      ),
      ...normalizeEvents(
        attendanceOpenResult,
        "Attendance",
      ),
      ...normalizeEvents(
        attendanceCloseResult,
        "Attendance",
      ),
      ...normalizeEvents(
        progressionBatchResult,
        "Progression",
      ),
      ...normalizeEvents(
        progressionDecisionResult,
        "Progression",
      ),
    ]
      .sort(
        (left, right) =>
          Date.parse(
            right.occurredAt,
          ) -
          Date.parse(
            left.occurredAt,
          ),
      )
      .slice(
        0,
        limit,
      );

  return {
    scope: {
      organizationWide:
        scope.organizationWide,
      branches:
        scope.branches,
    },
    events,
  };
}
