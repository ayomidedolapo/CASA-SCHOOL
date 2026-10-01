import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  countInstructionalGraceDays,
} from "@/server/attendance/card-replacement";
import {
  getSchoolClock,
} from "@/server/attendance/terminal-session";
import {
  isInstructionalDate,
} from "@/server/attendance/readiness";
import {
  getInitialCardRolloutState,
} from "@/server/card-production/initial-rollout";
import {
  emitCasaOperationalNotificationBestEffort,
  type CasaOperationalEventKey,
  type CasaOperationalSeverity,
} from "@/server/internal/operational-notifications";

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
      (result as { rows?: unknown }).rows,
    )
  ) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

type SmartCategory =
  | "CARD_PRODUCTION"
  | "SCANNER_ATTENDANCE"
  | "SCHOOL_ONBOARDING";

async function emitSchoolSmartNotification(
  input: {
    schoolId: string;
    branchId?: string | null;
    eventType: string;
    severity:
      CasaOperationalSeverity;
    category:
      SmartCategory;
    title: string;
    body: string;
    actionUrl: string;
    dedupKey: string;
    dedupeSeconds: number;
    payload?: Record<
      string,
      unknown
    >;
  },
) {
  const db = getDb();
  const branchId =
    input.branchId ??
    null;
  const payload =
    JSON.stringify({
      ...(input.payload ?? {}),
      smart: {
        schemaVersion:
          1,
        severity:
          input.severity,
        category:
          input.category,
        dedupKey:
          input.dedupKey,
      },
    });

  await db.execute(sql`
    insert into casa_in_app_notifications (
      school_id,
      branch_id,
      recipient_school_membership_id,
      audience,
      event_type,
      title,
      body,
      action_url,
      payload,
      created_at
    )
    select
      ${input.schoolId}::uuid,
      ${branchId}::uuid,
      membership.id,
      'SCHOOL_OPERATOR',
      ${input.eventType},
      ${input.title.slice(
        0,
        160,
      )},
      ${input.body.slice(
        0,
        600,
      )},
      ${input.actionUrl},
      ${payload}::jsonb,
      now()
    from school_memberships
      membership
    where
      membership.school_id =
        ${input.schoolId}::uuid
      and membership.status =
        'ACTIVE'::school_membership_status
      and exists (
        select 1
        from school_membership_roles role
        where
          role.school_id =
            membership.school_id
          and role.membership_id =
            membership.id
          and role.role in (
            'OWNER',
            'ADMIN',
            'SCHOOL_TECHNICIAN'
          )
      )
      and (
        ${branchId}::uuid
          is null
        or exists (
          select 1
          from school_membership_roles owner_role
          where
            owner_role.school_id =
              membership.school_id
            and owner_role.membership_id =
              membership.id
            and owner_role.role =
              'OWNER'
        )
        or exists (
          select 1
          from school_branch_admin_assignments assignment
          where
            assignment.school_id =
              membership.school_id
            and assignment.membership_id =
              membership.id
            and assignment.branch_id =
              ${branchId}::uuid
            and assignment.is_active =
              true
        )
        or exists (
          select 1
          from school_branch_staff_assignments assignment
          where
            assignment.school_id =
              membership.school_id
            and assignment.membership_id =
              membership.id
            and assignment.branch_id =
              ${branchId}::uuid
            and assignment.is_active =
              true
        )
        or (
          not exists (
            select 1
            from school_branch_admin_assignments assignment
            where
              assignment.school_id =
                membership.school_id
              and assignment.membership_id =
                membership.id
              and assignment.is_active =
                true
          )
          and not exists (
            select 1
            from school_branch_staff_assignments assignment
            where
              assignment.school_id =
                membership.school_id
              and assignment.membership_id =
                membership.id
              and assignment.is_active =
                true
          )
        )
      )
      and not exists (
        select 1
        from casa_in_app_notifications existing
        where
          existing.school_id =
            membership.school_id
          and existing.recipient_school_membership_id =
            membership.id
          and existing.event_type =
            ${input.eventType}
          and coalesce(
            existing.payload #>>
              '{smart,dedupKey}',
            ''
          ) =
            ${input.dedupKey}
          and existing.created_at >=
            now() -
              (
                ${Math.max(
                  0,
                  Math.trunc(
                    input.dedupeSeconds,
                  ),
                )}::int *
                interval '1 second'
              )
      )
  `);
}

async function emitDualRisk(
  input: {
    event:
      CasaOperationalEventKey;
    schoolId: string;
    branchId?: string | null;
    title: string;
    body: string;
    schoolActionUrl: string;
    internalActionUrl: string;
    dedupKey: string;
    dedupeSeconds: number;
    severity:
      CasaOperationalSeverity;
    category:
      SmartCategory;
    payload?: Record<
      string,
      unknown
    >;
  },
) {
  await emitSchoolSmartNotification({
    schoolId:
      input.schoolId,
    branchId:
      input.branchId,
    eventType:
      input.event,
    severity:
      input.severity,
    category:
      input.category,
    title:
      input.title,
    body:
      input.body,
    actionUrl:
      input.schoolActionUrl,
    dedupKey:
      input.dedupKey,
    dedupeSeconds:
      input.dedupeSeconds,
    payload:
      input.payload,
  });

  await emitCasaOperationalNotificationBestEffort({
    event:
      input.event,
    scope: {
      kind:
        "SCHOOL",
      schoolId:
        input.schoolId,
      branchId:
        input.branchId ??
        null,
    },
    title:
      input.title,
    body:
      input.body,
    actionUrl:
      input.internalActionUrl,
    dedupKey:
      input.dedupKey,
    dedupeSeconds:
      input.dedupeSeconds,
    payload:
      input.payload,
  });
}

async function reconcileReplacementGraceRisks(
  schoolId?:
    string,
) {
  const db = getDb();
  const schoolFilter =
    schoolId
      ? sql`and replacement.school_id = ${schoolId}::uuid`
      : sql``;

  const cases =
    rowsOf<{
      case_id: string;
      school_id:
        string;
      school_slug:
        string;
      school_timezone:
        string;
      student_id:
        string;
      casa_student_id:
        string;
      student_name:
        string;
      branch_id:
        string;
      branch_name:
        string;
      reported_lost_on:
        string;
      replacement_reason:
        "LOST" |
        "DAMAGED";
    }>(
      await db.execute(sql`
        select
          replacement.id::text
            as case_id,
          replacement.school_id::text
            as school_id,
          school.slug
            as school_slug,
          school.timezone
            as school_timezone,
          replacement.student_id::text
            as student_id,
          student.casa_student_id,
          concat_ws(
            ' ',
            student.first_name,
            nullif(
              student.middle_name,
              ''
            ),
            student.last_name
          ) as student_name,
          branch_map.branch_id::text
            as branch_id,
          branch.name
            as branch_name,
          replacement.reported_lost_on::text
            as reported_lost_on,
          replacement.replacement_reason::text
            as replacement_reason
        from student_card_replacement_cases
          replacement
        join schools school
          on school.id =
             replacement.school_id
         and school.status =
             'ACTIVE'::school_status
        join students student
          on student.school_id =
             replacement.school_id
         and student.id =
             replacement.student_id
         and student.status =
             'ACTIVE'::student_status
        join lateral (
          select
            enrollment.class_arm_id
          from student_enrollments
            enrollment
          where
            enrollment.school_id =
              replacement.school_id
            and enrollment.student_id =
              replacement.student_id
            and enrollment.status =
              'ACTIVE'::student_enrollment_status
          order by
            enrollment.starts_on desc,
            enrollment.created_at desc
          limit 1
        ) enrollment
          on true
        join school_branch_class_arms
          branch_map
          on branch_map.school_id =
             replacement.school_id
         and branch_map.class_arm_id =
             enrollment.class_arm_id
        join school_branches branch
          on branch.school_id =
             branch_map.school_id
         and branch.id =
             branch_map.branch_id
         and branch.status =
             'ACTIVE'::school_branch_status
        where
          replacement.status =
            'CARD_REPLACEMENT_PENDING'::student_card_replacement_case_status
          and replacement.payment_status =
            'UNPAID'::student_card_replacement_payment_status
          ${schoolFilter}
        order by
          replacement.reported_lost_on asc
        limit 200
      `),
    );

  let warning =
    0;
  let critical =
    0;

  for (
    const item of
      cases
  ) {
    const clock =
      getSchoolClock(
        new Date(),
        item.school_timezone,
      );
    const graceDay =
      await countInstructionalGraceDays({
        schoolId:
          item.school_id,
        branchId:
          item.branch_id,
        startsOn:
          item.reported_lost_on,
        endsOn:
          clock.date,
      });

    if (graceDay < 3) {
      continue;
    }

    if (graceDay === 3) {
      const instructionalToday =
        await isInstructionalDate({
          schoolId:
            item.school_id,
          branchId:
            item.branch_id,
          date:
            clock.date,
        });

      if (!instructionalToday) {
        continue;
      }

      warning +=
        1;
      await emitDualRisk({
        event:
          "CARD_REPLACEMENT_GRACE_ENDING",
        schoolId:
          item.school_id,
        branchId:
          item.branch_id,
        title:
          "Card replacement grace ends today",
        body:
          `${item.student_name} (${item.casa_student_id}) is on instructional grace day 3 of 3 for a ${item.replacement_reason.toLowerCase()} card. Record replacement payment before the next instructional attendance day or supervised attendance will be blocked.`,
        schoolActionUrl:
          `/schools/${encodeURIComponent(
            item.school_slug,
          )}/registry`,
        internalActionUrl:
          "/internal/card-production",
        dedupKey:
          `card-replacement-grace-ending:${item.case_id}:${clock.date}`,
        dedupeSeconds:
          86400,
        severity:
          "WARNING",
        category:
          "CARD_PRODUCTION",
        payload: {
          replacementCaseId:
            item.case_id,
          studentId:
            item.student_id,
          casaStudentId:
            item.casa_student_id,
          graceDay,
          schoolDate:
            clock.date,
        },
      });
      continue;
    }

    critical +=
      1;
    await emitDualRisk({
      event:
        "CARD_REPLACEMENT_PAYMENT_OVERDUE",
      schoolId:
        item.school_id,
      branchId:
        item.branch_id,
      title:
        "Replacement payment required - attendance blocked",
      body:
        `${item.student_name} (${item.casa_student_id}) has exhausted the 3-instructional-day card replacement grace period and the replacement is still UNPAID. Supervised lost-card attendance is blocked until payment is recorded.`,
      schoolActionUrl:
        `/schools/${encodeURIComponent(
          item.school_slug,
        )}/registry`,
      internalActionUrl:
        "/internal/card-production",
      dedupKey:
        `card-replacement-payment-overdue:${item.case_id}:${clock.date}`,
      dedupeSeconds:
        86400,
      severity:
        "CRITICAL",
      category:
        "CARD_PRODUCTION",
      payload: {
        replacementCaseId:
          item.case_id,
        studentId:
          item.student_id,
        casaStudentId:
          item.casa_student_id,
        graceDay,
        schoolDate:
          clock.date,
      },
    });
  }

  return {
    warning,
    critical,
  };
}

function clockMinutes(
  value: string,
) {
  const [
    hour,
    minute,
  ] =
    value
      .slice(
        0,
        5,
      )
      .split(
        ":",
      )
      .map(
        Number,
      );

  return (
    hour *
      60 +
    minute
  );
}

async function reconcileStaleAttendanceRisks(
  schoolId?:
    string,
) {
  const db = getDb();
  const schoolFilter =
    schoolId
      ? sql`and branch_session.school_id = ${schoolId}::uuid`
      : sql``;

  const openSessions =
    rowsOf<{
      branch_session_id:
        string;
      school_id:
        string;
      school_slug:
        string;
      school_timezone:
        string;
      branch_id:
        string;
      branch_name:
        string;
      attendance_date:
        string;
      check_out_closes_at:
        string | null;
    }>(
      await db.execute(sql`
        select
          branch_session.id::text
            as branch_session_id,
          branch_session.school_id::text
            as school_id,
          school.slug
            as school_slug,
          school.timezone
            as school_timezone,
          branch_session.branch_id::text
            as branch_id,
          branch.name
            as branch_name,
          session.attendance_date::text
            as attendance_date,
          day.check_out_closes_at::text
            as check_out_closes_at
        from attendance_branch_sessions
          branch_session
        join attendance_sessions session
          on session.school_id =
             branch_session.school_id
         and session.id =
             branch_session.session_id
        join schools school
          on school.id =
             branch_session.school_id
         and school.status =
             'ACTIVE'::school_status
        join school_branches branch
          on branch.school_id =
             branch_session.school_id
         and branch.id =
             branch_session.branch_id
        left join attendance_policy_days day
          on day.school_id =
             branch_session.school_id
         and day.policy_id =
             coalesce(
               branch_session.policy_id,
               session.policy_id
             )
         and day.weekday =
             extract(
               dow
               from session.attendance_date
             )::int
        where
          branch_session.status =
            'OPEN'
          and session.attendance_date >=
            (
              (
                now() at time zone
                  school.timezone
              )::date -
              1
            )
          ${schoolFilter}
        order by
          session.attendance_date asc
        limit 100
      `),
    );

  let stale =
    0;

  for (
    const item of
      openSessions
  ) {
    const clock =
      getSchoolClock(
        new Date(),
        item.school_timezone,
      );
    const isPastDate =
      item.attendance_date <
      clock.date;
    const isLateToday =
      item.attendance_date ===
        clock.date &&
      Boolean(
        item.check_out_closes_at,
      ) &&
      clockMinutes(
        clock.clock,
      ) >
        clockMinutes(
          item.check_out_closes_at ??
          "23:59",
        ) +
          30;

    if (
      !isPastDate &&
      !isLateToday
    ) {
      continue;
    }

    stale +=
      1;
    await emitDualRisk({
      event:
        "ATTENDANCE_SESSION_STALE_OPEN",
      schoolId:
        item.school_id,
      branchId:
        item.branch_id,
      title:
        "Attendance session still open",
      body:
        `${item.branch_name} attendance for ${item.attendance_date} is still OPEN beyond the normal checkout period. Review students still on campus and close the session when operations are complete.`,
      schoolActionUrl:
        `/schools/${encodeURIComponent(
          item.school_slug,
        )}/attendance`,
      internalActionUrl:
        `/internal/schools/${encodeURIComponent(
          item.school_id,
        )}`,
      dedupKey:
        `attendance-stale-open:${item.branch_session_id}`,
      dedupeSeconds:
        21600,
      severity:
        "WARNING",
      category:
        "SCANNER_ATTENDANCE",
      payload: {
        branchSessionId:
          item.branch_session_id,
        attendanceDate:
          item.attendance_date,
      },
    });
  }

  return {
    stale,
  };
}

async function reconcileInitialRolloutRisks(
  schoolId?:
    string,
) {
  const db = getDb();
  const filter =
    schoolId
      ? sql`and school.id = ${schoolId}::uuid`
      : sql``;

  const schools =
    rowsOf<{
      id: string;
      name: string;
    }>(
      await db.execute(sql`
        select
          school.id::text,
          school.name
        from schools school
        where
          school.status =
            'ACTIVE'::school_status
          and school.initial_card_rollout_completed_at
            is null
          ${filter}
        order by
          school.created_at asc
        limit 100
      `),
    );

  let templateMissing =
    0;
  let backfillPending =
    0;
  let ready =
    0;

  for (
    const school of
      schools
  ) {
    const state =
      await getInitialCardRolloutState({
        schoolId:
          school.id,
      });

    if (
      !state ||
      state.completedAt ||
      state.activeStudents <
        1
    ) {
      continue;
    }

    if (
      !state.activeTemplate &&
      state.activeEnrolledStudents >
        0
    ) {
      templateMissing +=
        1;
      await emitCasaOperationalNotificationBestEffort({
        event:
          "INITIAL_CARD_ROLLOUT_TEMPLATE_MISSING",
        scope: {
          kind:
            "SCHOOL",
          schoolId:
            school.id,
        },
        title:
          "Initial card rollout is waiting for a template",
        body:
          `${school.name} has ${state.activeEnrolledStudents} enrolled student(s), but no ACTIVE card template. First-card creation cannot complete until a template is activated.`,
        actionUrl:
          "/internal/card-production",
        dedupKey:
          `initial-rollout-template-missing:${school.id}`,
        dedupeSeconds:
          21600,
        payload: {
          rolloutState:
            state,
        },
      });
      continue;
    }

    if (
      state.missingFirstCards >
        0 ||
      state.scheduledFirstCards >
        0
    ) {
      backfillPending +=
        1;
      await emitCasaOperationalNotificationBestEffort({
        event:
          "INITIAL_CARD_ROLLOUT_BACKFILL_PENDING",
        scope: {
          kind:
            "SCHOOL",
          schoolId:
            school.id,
        },
        title:
          "Initial first-card rollout needs attention",
        body:
          `${school.name} still has ${state.missingFirstCards} enrolled student(s) without a first card and ${state.scheduledFirstCards} initial first-card job(s) waiting for a future date. CASA will keep reconciling this automatically.`,
        actionUrl:
          `/internal/schools/${encodeURIComponent(
            school.id,
          )}`,
        dedupKey:
          `initial-rollout-backfill:${school.id}`,
        dedupeSeconds:
          21600,
        payload: {
          rolloutState:
            state,
        },
      });
      continue;
    }

    if (
      state.canComplete
    ) {
      ready +=
        1;
      await emitCasaOperationalNotificationBestEffort({
        event:
          "INITIAL_CARD_ROLLOUT_READY",
        scope: {
          kind:
            "SCHOOL",
          schoolId:
            school.id,
        },
        title:
          "Initial card rollout is ready for Super Admin review",
        body:
          `${school.name} has cleared its initial rollout blockers. A CASA Super Admin can review the roster and confirm the rollout cutoff. Future mid-term admissions will then follow normal term-end first-card batching.`,
        actionUrl:
          `/internal/schools/${encodeURIComponent(
            school.id,
          )}`,
        dedupKey:
          `initial-rollout-ready:${school.id}`,
        dedupeSeconds:
          21600,
        payload: {
          rolloutState:
            state,
        },
      });
    }
  }

  return {
    templateMissing,
    backfillPending,
    ready,
  };
}

export async function reconcileSmartOperationalRisks(
  input: {
    schoolId?: string;
  } = {},
) {
  const replacement =
    await reconcileReplacementGraceRisks(
      input.schoolId,
    );
  const attendance =
    await reconcileStaleAttendanceRisks(
      input.schoolId,
    );
  const rollout =
    await reconcileInitialRolloutRisks(
      input.schoolId,
    );

  return {
    replacement,
    attendance,
    rollout,
  };
}
