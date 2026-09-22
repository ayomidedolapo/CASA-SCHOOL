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
        where
          job.status in (
            'READY'::student_card_production_status,
            'EXPORTED'::student_card_production_status
          )
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
  };
}
