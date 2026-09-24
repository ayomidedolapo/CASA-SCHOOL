import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  emitCasaOperationalNotificationBestEffort,
} from "@/server/internal/operational-notifications";
import {
  reconcileTerminalHealthNotifications,
} from "@/server/internal/terminal-health";

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

export async function reconcileCasaOperationalNotifications() {
  const terminalHealth =
    await reconcileTerminalHealthNotifications();
  const db = getDb();

  const unassignedTerminals =
    rowsOf<{
      terminal_id: string;
      school_id: string;
      terminal_name: string;
      terminal_code: string;
    }>(
      await db.execute(sql`
        select
          terminal.id::text as terminal_id,
          terminal.school_id::text as school_id,
          terminal.name as terminal_name,
          terminal.terminal_code
        from attendance_terminals terminal
        join schools school
          on school.id =
             terminal.school_id
        where
          terminal.status =
            'ACTIVE'::attendance_terminal_status
          and school.status =
            'ACTIVE'::school_status
          and not exists (
            select 1
            from school_branch_terminals mapping
            where
              mapping.school_id =
                terminal.school_id
              and mapping.terminal_id =
                terminal.id
          )
      `),
    );

  for (
    const terminal of
      unassignedTerminals
  ) {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "ATTENDANCE_TERMINAL_UNASSIGNED",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          terminal.school_id,
      },
      title:
        `Scanner needs campus assignment · ${terminal.terminal_name}`,
      body:
        "An active attendance scanner is not assigned to a campus. Attendance routing may be ambiguous until it is assigned.",
      actionUrl:
        "/internal/structure",
      dedupKey:
        `terminal-unassigned:${terminal.terminal_id}`,
      payload: {
        terminalId:
          terminal.terminal_id,
        terminalCode:
          terminal.terminal_code,
      },
    });
  }

  const cardBacklogs =
    rowsOf<{
      school_id: string;
      branch_id:
        string | null;
      backlog_count:
        number;
    }>(
      await db.execute(sql`
        select
          job.school_id::text
            as school_id,
          nullif(
            job.render_snapshot ->>
              'branchId',
            ''
          ) as branch_id,
          count(*)::int
            as backlog_count
        from student_card_production_jobs job
        join student_identity_cards card
          on card.school_id =
             job.school_id
         and card.id =
             job.card_id
        where
          job.status in (
            'READY'::student_card_production_status,
            'EXPORTED'::student_card_production_status
          )
          and card.status =
            'READY_FOR_ACTIVATION'::student_identity_card_status
          and job.queued_at <=
            now()
          and job.queued_at <
            now() -
              interval '24 hours'
        group by
          job.school_id,
          nullif(
            job.render_snapshot ->>
              'branchId',
            ''
          )
      `),
    );

  for (
    const backlog of
      cardBacklogs
  ) {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "CARD_PRODUCTION_BACKLOG",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          backlog.school_id,
        branchId:
          backlog.branch_id,
      },
      title:
        "Card production backlog",
      body:
        `${backlog.backlog_count} card production job(s) have remained unprinted for more than 24 hours.`,
      actionUrl:
        "/internal/card-production",
      dedupKey:
        `card-backlog:${backlog.school_id}:${backlog.branch_id ?? "all"}`,
      payload: {
        backlogCount:
          backlog.backlog_count,
      },
    });
  }

  const failedPush =
    rowsOf<{
      school_id: string;
      failed_count: number;
    }>(
      await db.execute(sql`
        select
          school_id::text
            as school_id,
          count(*)::int
            as failed_count
        from guardian_push_outbox
        where
          status =
            'FAILED'
          and updated_at >=
            now() -
              interval '24 hours'
        group by
          school_id
      `),
    );

  for (
    const failure of
      failedPush
  ) {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "GUARDIAN_PUSH_DELIVERY_FAILED",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          failure.school_id,
      },
      title:
        "Guardian push delivery failures",
      body:
        `${failure.failed_count} guardian push notification(s) reached terminal failure in the last 24 hours.`,
      actionUrl:
        "/internal/notifications",
      dedupKey:
        `guardian-push-failed:${failure.school_id}`,
      payload: {
        failedCount:
          failure.failed_count,
      },
    });
  }

  const stalledPush =
    rowsOf<{
      school_id: string;
      stalled_count: number;
    }>(
      await db.execute(sql`
        select
          school_id::text
            as school_id,
          count(*)::int
            as stalled_count
        from guardian_push_outbox
        where
          status =
            'PROCESSING'
          and locked_at <
            now() -
              interval '10 minutes'
        group by
          school_id
      `),
    );

  for (
    const stalled of
      stalledPush
  ) {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "GUARDIAN_PUSH_WORKER_STALLED",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          stalled.school_id,
      },
      title:
        "Guardian push worker appears stalled",
      body:
        `${stalled.stalled_count} guardian push delivery item(s) have remained locked for more than 10 minutes.`,
      actionUrl:
        "/internal/health",
      dedupKey:
        `guardian-push-stalled:${stalled.school_id}`,
      payload: {
        stalledCount:
          stalled.stalled_count,
      },
    });
  }

  const schoolActivity =
    rowsOf<{
      source_key: string;
      school_id:
        string;
      branch_id:
        string | null;
      title: string;
      body: string;
      action_url:
        string;
      occurred_at:
        string | Date;
      payload:
        Record<
          string,
          unknown
        >;
    }>(
      await db.execute(sql`
        with activity as (
          select
            'student-registered:' ||
              student.id::text
              as source_key,
            student.school_id::text
              as school_id,
            student.home_branch_id::text
              as branch_id,
            'Student registered'
              as title,
            concat_ws(
              ' ',
              student.first_name,
              nullif(
                student.middle_name,
                ''
              ),
              student.last_name
            ) ||
              ' was added to ' ||
              school.name ||
              '.'
              as body,
            '/internal/schools/' ||
              student.school_id::text
              as action_url,
            student.created_at
              as occurred_at,
            jsonb_build_object(
              'studentId',
                student.id::text,
              'casaStudentId',
                student.casa_student_id,
              'activityKind',
                'STUDENT_REGISTERED'
            ) as payload
          from students student
          join schools school
            on school.id =
               student.school_id
          where
            student.created_at >=
              now() -
                interval '48 hours'

          union all

          select
            'attendance-open:' ||
              branch_session.id::text,
            branch_session.school_id::text,
            branch_session.branch_id::text,
            'Attendance opened',
            branch.name ||
              ' attendance was opened for ' ||
              session.attendance_date::text ||
              '.',
            '/internal/schools/' ||
              branch_session.school_id::text,
            branch_session.opened_at,
            jsonb_build_object(
              'branchSessionId',
                branch_session.id::text,
              'attendanceDate',
                session.attendance_date::text,
              'activityKind',
                'ATTENDANCE_OPENED'
            )
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
          where
            branch_session.opened_at >=
              now() -
                interval '48 hours'

          union all

          select
            'attendance-close:' ||
              branch_session.id::text,
            branch_session.school_id::text,
            branch_session.branch_id::text,
            'Attendance closed',
            branch.name ||
              ' attendance was closed for ' ||
              session.attendance_date::text ||
              '.',
            '/internal/schools/' ||
              branch_session.school_id::text,
            branch_session.closed_at,
            jsonb_build_object(
              'branchSessionId',
                branch_session.id::text,
              'attendanceDate',
                session.attendance_date::text,
              'activityKind',
                'ATTENDANCE_CLOSED'
            )
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
          where
            branch_session.closed_at >=
              now() -
                interval '48 hours'

          union all

          select
            'biometric:' ||
              event.id::text,
            event.school_id::text,
            student.home_branch_id::text,
            'Student identity activity',
            concat_ws(
              ' ',
              student.first_name,
              nullif(
                student.middle_name,
                ''
              ),
              student.last_name
            ) ||
              ' · ' ||
              replace(
                event.event_type::text,
                '_',
                ' '
              ),
            '/internal/schools/' ||
              event.school_id::text,
            event.created_at,
            jsonb_build_object(
              'studentId',
                event.student_id::text,
              'biometricEventId',
                event.id::text,
              'activityKind',
                event.event_type::text
            )
          from student_biometric_profile_events
            event
          join students student
            on student.school_id =
               event.school_id
           and student.id =
               event.student_id
          where
            event.created_at >=
              now() -
                interval '48 hours'

          union all

          select
            'progression:' ||
              batch.id::text ||
              ':' ||
              batch.status::text,
            batch.school_id::text,
            batch.branch_id::text,
            case
              when batch.status::text =
                'CONFIRMED'
                then
                  'Progression confirmed'
              else
                'Progression batch created'
            end,
            branch.name ||
              ' · ' ||
              source_session.name ||
              ' to ' ||
              target_session.name,
            '/internal/schools/' ||
              batch.school_id::text,
            coalesce(
              batch.confirmed_at,
              batch.created_at
            ),
            jsonb_build_object(
              'progressionBatchId',
                batch.id::text,
              'activityKind',
                'PROGRESSION_' ||
                batch.status::text
            )
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
          where
            coalesce(
              batch.confirmed_at,
              batch.created_at
            ) >=
              now() -
                interval '48 hours'

          union all

          select
            'card-lifecycle:' ||
              event.id::text,
            event.school_id::text,
            student.home_branch_id::text,
            'Student card activity',
            concat_ws(
              ' ',
              student.first_name,
              nullif(
                student.middle_name,
                ''
              ),
              student.last_name
            ) ||
              ' · ' ||
              replace(
                event.event_type::text,
                '_',
                ' '
              ),
            '/internal/card-production',
            event.created_at,
            jsonb_build_object(
              'studentId',
                event.student_id::text,
              'cardId',
                event.card_id::text,
              'cardEventId',
                event.id::text,
              'activityKind',
                event.event_type::text
            )
          from student_identity_card_events
            event
          join students student
            on student.school_id =
               event.school_id
           and student.id =
               event.student_id
          where
            event.created_at >=
              now() -
                interval '48 hours'
        )
        select
          source_key,
          school_id,
          branch_id,
          title,
          body,
          action_url,
          occurred_at,
          payload
        from activity
        where
          occurred_at is not null
        order by
          occurred_at desc
        limit 200
      `),
    );

  for (
    const activity of
      schoolActivity
  ) {
    await emitCasaOperationalNotificationBestEffort({
      event:
        "SCHOOL_ACTIVITY",
      scope: {
        kind:
          "SCHOOL",
        schoolId:
          activity.school_id,
        branchId:
          activity.branch_id,
      },
      title:
        activity.title,
      body:
        activity.body,
      actionUrl:
        activity.action_url,
      dedupKey:
        `school-activity:${activity.source_key}`,
      dedupeSeconds:
        604800,
      payload: {
        ...(
          activity.payload ??
          {}
        ),
        sourceActivityKey:
          activity.source_key,
        occurredAt:
          activity.occurred_at,
      },
    });
  }

  return {
    terminalHealth,
    unassignedTerminals:
      unassignedTerminals.length,
    cardBacklogs:
      cardBacklogs.length,
    failedPushSchools:
      failedPush.length,
    stalledPushSchools:
      stalledPush.length,
    schoolActivities:
      schoolActivity.length,
  };
}
