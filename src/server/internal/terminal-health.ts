import { sql } from "drizzle-orm";

import { getDb } from "@/db";

type TerminalHealthStatus = "ONLINE" | "OFFLINE";

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export async function reconcileTerminalHealthNotifications(input?: {
  schoolId?: string | null;
}) {
  const db = getDb();
  const terminals = rowsOf<{
    terminal_id: string;
    school_id: string;
    branch_id: string | null;
    terminal_name: string;
    terminal_code: string;
    school_name: string;
    branch_name: string | null;
    last_seen_at: Date | string | null;
  }>(await db.execute(sql`
    select
      terminal.id::text as terminal_id,
      terminal.school_id::text as school_id,
      branch_map.branch_id::text as branch_id,
      terminal.name as terminal_name,
      terminal.terminal_code,
      school.name as school_name,
      branch.name as branch_name,
      terminal.last_seen_at
    from attendance_terminals terminal
    join schools school on school.id = terminal.school_id
    left join school_branch_terminals branch_map
      on branch_map.school_id = terminal.school_id
     and branch_map.terminal_id = terminal.id
    left join school_branches branch
      on branch.school_id = branch_map.school_id
     and branch.id = branch_map.branch_id
    where terminal.status = 'ACTIVE'::attendance_terminal_status
      and school.status = 'ACTIVE'::school_status
      and (${input?.schoolId ?? null}::uuid is null or terminal.school_id = ${input?.schoolId ?? null}::uuid)
  `));

  const threshold = Date.now() - 5 * 60 * 1000;
  let transitions = 0;

  for (const terminal of terminals) {
    const observed: TerminalHealthStatus =
      terminal.last_seen_at && new Date(terminal.last_seen_at).getTime() >= threshold
        ? "ONLINE"
        : "OFFLINE";

    const previous = rowsOf<{ observed_status: TerminalHealthStatus }>(await db.execute(sql`
      select observed_status
      from attendance_terminal_health_states
      where terminal_id = ${terminal.terminal_id}::uuid
      limit 1
    `))[0];

    if (!previous) {
      const created = rowsOf<{ terminal_id: string }>(await db.execute(sql`
        insert into attendance_terminal_health_states (
          terminal_id, school_id, branch_id, observed_status,
          last_transition_at, created_at, updated_at
        ) values (
          ${terminal.terminal_id}::uuid,
          ${terminal.school_id}::uuid,
          ${terminal.branch_id}::uuid,
          ${observed},
          now(), now(), now()
        )
        on conflict (terminal_id) do nothing
        returning terminal_id::text
      `))[0];

      // Only the reconciler that won the first insert may emit an adoption
      // transition. This keeps concurrent Platform Control / scanner requests
      // from duplicating the same OFFLINE notification.
      if (!created || !terminal.last_seen_at || observed === "ONLINE") continue;
    } else if (previous.observed_status === observed) {
      await db.execute(sql`
        update attendance_terminal_health_states
        set branch_id = ${terminal.branch_id}::uuid, updated_at = now()
        where terminal_id = ${terminal.terminal_id}::uuid
      `);
      continue;
    } else {
      const changed = rowsOf<{ terminal_id: string }>(await db.execute(sql`
        update attendance_terminal_health_states
        set
          school_id = ${terminal.school_id}::uuid,
          branch_id = ${terminal.branch_id}::uuid,
          observed_status = ${observed},
          last_transition_at = now(),
          updated_at = now()
        where terminal_id = ${terminal.terminal_id}::uuid
          and observed_status <> ${observed}
        returning terminal_id::text
      `))[0];
      if (!changed) continue;
    }

    transitions += 1;
    const eventType = observed === "OFFLINE"
      ? "ATTENDANCE_TERMINAL_OFFLINE"
      : "ATTENDANCE_TERMINAL_ONLINE";
    const title = observed === "OFFLINE"
      ? `Scanner offline · ${terminal.terminal_name}`
      : `Scanner online · ${terminal.terminal_name}`;
    const body = observed === "OFFLINE"
      ? `${terminal.school_name}${terminal.branch_name ? ` · ${terminal.branch_name}` : ""}: ${terminal.terminal_name} has not checked in for more than five minutes.`
      : `${terminal.school_name}${terminal.branch_name ? ` · ${terminal.branch_name}` : ""}: ${terminal.terminal_name} is responding again.`;

    await db.execute(sql`
      insert into casa_in_app_notifications (
        school_id,
        branch_id,
        recipient_internal_membership_id,
        audience,
        event_type,
        title,
        body,
        action_url,
        payload,
        created_at
      )
      select
        ${terminal.school_id}::uuid,
        ${terminal.branch_id}::uuid,
        membership.id,
        'CASA_INTERNAL',
        ${eventType},
        ${title},
        ${body},
        '/internal/notifications',
        jsonb_build_object(
          'terminalId', ${terminal.terminal_id},
          'terminalCode', ${terminal.terminal_code},
          'observedStatus', ${observed},
          'lastSeenAt', ${terminal.last_seen_at ? new Date(terminal.last_seen_at).toISOString() : null}
        ),
        now()
      from casa_internal_memberships membership
      where membership.status = 'ACTIVE'
        and (
          membership.role = 'CASA_SUPER_ADMIN'
          or exists (
            select 1
            from casa_internal_school_assignments assignment
            where assignment.membership_id = membership.id
              and assignment.school_id = ${terminal.school_id}::uuid
              and assignment.status = 'ACTIVE'
          )
        )
    `);
  }

  return { checked: terminals.length, transitions };
}
