import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import type {
  SchoolAccess,
} from "@/server/auth/authorization";

import {
  getSchoolClock,
} from "./terminal-session";

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
      (result as {
        rows?: unknown;
      }).rows,
    )
  ) {
    return (result as {
      rows: T[];
    }).rows;
  }

  return [];
}

export class AttendanceReadinessError
  extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name =
      "AttendanceReadinessError";
  }
}

export type SchoolAttendanceLifecycleStatus =
  | "SETUP"
  | "READY"
  | "ACTIVE"
  | "PAUSED";

export interface AttendanceLifecycleState {
  id: string | null;
  status:
    SchoolAttendanceLifecycleStatus;
  effectiveStartDate:
    string | null;
  readyAt:
    string | Date | null;
  activatedAt:
    string | Date | null;
  pausedAt:
    string | Date | null;
  scheduledResumeAt:
    string | Date | null;
  scheduledResumeReason:
    string | null;
}

function datePlusDays(
  date: string,
  days: number,
): string {
  const value =
    new Date(
      `${date}T00:00:00.000Z`,
    );

  value.setUTCDate(
    value.getUTCDate() +
      days,
  );

  return value
    .toISOString()
    .slice(0, 10);
}

function weekdayForDate(
  date: string,
): number {
  return new Date(
    `${date}T00:00:00.000Z`,
  ).getUTCDay();
}

async function applyDueScheduledResume(
  schoolId: string,
) {
  const db = getDb();

  await db.execute(sql`
    with candidate as (
      select
        id,
        school_id,
        effective_start_date,
        scheduled_resume_at
          as scheduled_for,
        scheduled_resume_by_membership_id
          as scheduled_by,
        scheduled_resume_reason
          as scheduled_reason
      from school_attendance_lifecycles
      where
        school_id =
          ${schoolId}::uuid
        and status =
          'PAUSED'::school_attendance_lifecycle_status
        and scheduled_resume_at is not null
        and scheduled_resume_at <= now()
      limit 1
      for update
    ),
    due as (
      update school_attendance_lifecycles lifecycle
      set
        status =
          'ACTIVE'::school_attendance_lifecycle_status,
        paused_at = null,
        paused_by_membership_id = null,
        scheduled_resume_at = null,
        scheduled_resume_by_membership_id = null,
        scheduled_resume_reason = null,
        updated_at = now()
      from candidate
      where
        lifecycle.id =
          candidate.id
        and lifecycle.school_id =
          candidate.school_id
      returning
        lifecycle.id,
        lifecycle.school_id,
        lifecycle.effective_start_date,
        candidate.scheduled_for,
        candidate.scheduled_by,
        candidate.scheduled_reason
    ),
    event as (
      insert into school_attendance_lifecycle_events (
        school_id,
        lifecycle_id,
        actor_membership_id,
        event_type,
        effective_start_date,
        scheduled_for,
        reason,
        created_at
      )
      select
        school_id,
        id,
        scheduled_by,
        'RESUMED'::school_attendance_lifecycle_event_type,
        effective_start_date,
        scheduled_for,
        coalesce(
          scheduled_reason,
          'Scheduled attendance resume'
        ),
        now()
      from due
      where scheduled_by is not null
      returning id
    )
    select id
    from event
  `);
}

export async function getAttendanceLifecycle(
  schoolId: string,
): Promise<AttendanceLifecycleState> {
  await applyDueScheduledResume(
    schoolId,
  );

  const db = getDb();

  const result =
    await db.execute(sql`
      select
        id,
        status::text as status,
        effective_start_date::text
          as effective_start_date,
        ready_at,
        activated_at,
        paused_at,
        scheduled_resume_at,
        scheduled_resume_reason
      from school_attendance_lifecycles
      where school_id =
        ${schoolId}::uuid
      limit 1
    `);

  const row =
    rowsOf<{
      id: string;
      status:
        SchoolAttendanceLifecycleStatus;
      effective_start_date:
        string | null;
      ready_at:
        Date | string | null;
      activated_at:
        Date | string | null;
      paused_at:
        Date | string | null;
      scheduled_resume_at:
        Date | string | null;
      scheduled_resume_reason:
        string | null;
    }>(result)[0];

  if (!row) {
    return {
      id: null,
      status: "SETUP",
      effectiveStartDate: null,
      readyAt: null,
      activatedAt: null,
      pausedAt: null,
      scheduledResumeAt: null,
      scheduledResumeReason: null,
    };
  }

  return {
    id: row.id,
    status:
      row.status,
    effectiveStartDate:
      row.effective_start_date,
    readyAt:
      row.ready_at,
    activatedAt:
      row.activated_at,
    pausedAt:
      row.paused_at,
    scheduledResumeAt:
      row.scheduled_resume_at,
    scheduledResumeReason:
      row.scheduled_resume_reason,
  };
}

export async function isInstructionalDate(
  input: {
    schoolId: string;
    date: string;
    branchId?: string | null;
  },
): Promise<boolean> {
  const db = getDb();
  const weekday =
    weekdayForDate(
      input.date,
    );

  const result =
    await db.execute(sql`
      select
        exists (
          select 1
          from attendance_policies p
          join attendance_policy_days d
            on d.school_id =
               p.school_id
           and d.policy_id =
               p.id
          where
            p.school_id =
              ${input.schoolId}::uuid
            and (
              ${input.branchId ?? null}::uuid is null
              or p.branch_id = ${input.branchId ?? null}::uuid
            )
            and p.is_default = true
            and p.is_active = true
            and p.valid_from <=
              ${input.date}::date
            and (
              p.valid_to is null
              or p.valid_to >=
                 ${input.date}::date
            )
            and d.weekday =
              ${weekday}
        )
        and not exists (
          select 1
          from school_calendar_events e
          where
            e.school_id =
              ${input.schoolId}::uuid
            and e.starts_on <=
              ${input.date}::date
            and e.ends_on >=
              ${input.date}::date
            and (
              e.branch_id is null
              or (
                ${input.branchId ?? null}::uuid
                  is not null
                and e.branch_id =
                  ${input.branchId ?? null}::uuid
              )
            )
        )
        as instructional
    `);

  return Boolean(
    rowsOf<{
      instructional:
        boolean;
    }>(result)[0]
      ?.instructional,
  );
}

export async function findNextInstructionalDate(
  input: {
    schoolId: string;
    afterDate: string;
    branchId?: string | null;
  },
): Promise<string> {
  for (
    let offset = 1;
    offset <= 370;
    offset += 1
  ) {
    const date =
      datePlusDays(
        input.afterDate,
        offset,
      );

    if (
      await isInstructionalDate({
        schoolId:
          input.schoolId,
        date,
        branchId:
          input.branchId ??
          null,
      })
    ) {
      return date;
    }
  }

  throw new AttendanceReadinessError(
    "No instructional date could be resolved from the active attendance policy.",
    409,
    "ATTENDANCE_INSTRUCTIONAL_DATE_REQUIRED",
  );
}

export async function getAttendanceReadinessRejection(
  input: {
    schoolId: string;
    date: string;
  },
): Promise<{
  status: 409;
  code:
    | "ATTENDANCE_NOT_ACTIVE"
    | "ATTENDANCE_PAUSED"
    | "ATTENDANCE_EFFECTIVE_DATE_NOT_REACHED";
} | null> {
  const lifecycle =
    await getAttendanceLifecycle(
      input.schoolId,
    );

  if (
    lifecycle.status ===
      "PAUSED"
  ) {
    return {
      status: 409,
      code:
        "ATTENDANCE_PAUSED",
    };
  }

  if (
    lifecycle.status !==
      "ACTIVE"
  ) {
    return {
      status: 409,
      code:
        "ATTENDANCE_NOT_ACTIVE",
    };
  }

  if (
    !lifecycle.effectiveStartDate ||
    lifecycle.effectiveStartDate >
      input.date
  ) {
    return {
      status: 409,
      code:
        "ATTENDANCE_EFFECTIVE_DATE_NOT_REACHED",
    };
  }

  return null;
}

async function requirePolicyReadiness(
  schoolId: string,
) {
  const db = getDb();

  const result =
    await db.execute(sql`
      select
        p.id,
        count(d.weekday)::int
          as day_count
      from attendance_policies p
      left join attendance_policy_days d
        on d.school_id =
           p.school_id
       and d.policy_id =
           p.id
      where
        p.school_id =
          ${schoolId}::uuid
        and p.is_default = true
        and p.is_active = true
      group by p.id
      order by p.created_at desc
      limit 1
    `);

  const row =
    rowsOf<{
      id: string;
      day_count: number;
    }>(result)[0];

  if (
    !row ||
    Number(
      row.day_count,
    ) < 1
  ) {
    throw new AttendanceReadinessError(
      "An active default attendance policy with at least one instructional weekday is required.",
      409,
      "ATTENDANCE_POLICY_REQUIRED",
    );
  }

  return row;
}

export async function markAttendanceReady(
  input: {
    access: SchoolAccess;
    reason?: string | null;
  },
) {
  await requirePolicyReadiness(
    input.access.school.id,
  );

  const current =
    await getAttendanceLifecycle(
      input.access.school.id,
    );

  if (
    current.status ===
      "READY"
  ) {
    return current;
  }

  if (
    current.status !==
      "SETUP"
  ) {
    throw new AttendanceReadinessError(
      "Only attendance in SETUP may be marked READY.",
      409,
      "ATTENDANCE_LIFECYCLE_INVALID_TRANSITION",
    );
  }

  const db = getDb();
  const result =
    await db.execute(sql`
      with lifecycle as (
        insert into school_attendance_lifecycles (
          id,
          school_id,
          status,
          ready_at,
          ready_by_membership_id,
          created_at,
          updated_at
        )
        values (
          gen_random_uuid(),
          ${input.access.school.id}::uuid,
          'READY'::school_attendance_lifecycle_status,
          now(),
          ${input.access.membership.id}::uuid,
          now(),
          now()
        )
        on conflict (school_id)
        do update set
          status =
            'READY'::school_attendance_lifecycle_status,
          ready_at =
            coalesce(
              school_attendance_lifecycles.ready_at,
              now()
            ),
          ready_by_membership_id =
            coalesce(
              school_attendance_lifecycles.ready_by_membership_id,
              ${input.access.membership.id}::uuid
            ),
          updated_at = now()
        where
          school_attendance_lifecycles.status =
            'SETUP'::school_attendance_lifecycle_status
        returning *
      ),
      event as (
        insert into school_attendance_lifecycle_events (
          school_id,
          lifecycle_id,
          actor_membership_id,
          event_type,
          reason,
          created_at
        )
        select
          school_id,
          id,
          ${input.access.membership.id}::uuid,
          'MARKED_READY'::school_attendance_lifecycle_event_type,
          ${input.reason ?? null},
          now()
        from lifecycle
        returning id
      )
      select
        id,
        status::text as status,
        effective_start_date::text
          as effective_start_date,
        ready_at,
        activated_at,
        paused_at
      from lifecycle
    `);

  const row =
    rowsOf<Record<string, unknown>>(
      result,
    )[0];

  if (!row) {
    throw new AttendanceReadinessError(
      "Attendance readiness changed before it could be marked READY.",
      409,
      "ATTENDANCE_LIFECYCLE_STATE_CHANGED",
    );
  }

  return getAttendanceLifecycle(
    input.access.school.id,
  );
}

export async function activateAttendance(
  input: {
    access: SchoolAccess;
    effectiveDate?:
      string | null;
    confirmStartToday?:
      boolean;
    reason?: string | null;
  },
) {
  await requirePolicyReadiness(
    input.access.school.id,
  );

  const current =
    await getAttendanceLifecycle(
      input.access.school.id,
    );

  if (
    current.status !==
      "READY"
  ) {
    throw new AttendanceReadinessError(
      "Attendance must be READY before it can be activated.",
      409,
      "ATTENDANCE_LIFECYCLE_INVALID_TRANSITION",
    );
  }

  const clock =
    getSchoolClock(
      new Date(),
      input.access.school.timezone,
    );

  const effectiveDate =
    input.effectiveDate ??
    await findNextInstructionalDate({
      schoolId:
        input.access.school.id,
      afterDate:
        clock.date,
    });

  if (
    effectiveDate <
      clock.date
  ) {
    throw new AttendanceReadinessError(
      "Attendance cannot be activated retroactively.",
      400,
      "ATTENDANCE_RETROACTIVE_ACTIVATION_FORBIDDEN",
    );
  }

  if (
    effectiveDate ===
      clock.date &&
    input.confirmStartToday !==
      true
  ) {
    throw new AttendanceReadinessError(
      "Starting attendance today requires explicit confirmation.",
      409,
      "ATTENDANCE_START_TODAY_CONFIRMATION_REQUIRED",
    );
  }

  if (
    !await isInstructionalDate({
      schoolId:
        input.access.school.id,
      date:
        effectiveDate,
    })
  ) {
    throw new AttendanceReadinessError(
      "Attendance effective start date must be an instructional date.",
      409,
      "ATTENDANCE_EFFECTIVE_DATE_NOT_INSTRUCTIONAL",
    );
  }

  const db = getDb();

  const result =
    await db.execute(sql`
      with lifecycle as (
        update school_attendance_lifecycles
        set
          status =
            'ACTIVE'::school_attendance_lifecycle_status,
          effective_start_date =
            ${effectiveDate}::date,
          activated_at = now(),
          activated_by_membership_id =
            ${input.access.membership.id}::uuid,
          paused_at = null,
          paused_by_membership_id = null,
          updated_at = now()
        where
          school_id =
            ${input.access.school.id}::uuid
          and status =
            'READY'::school_attendance_lifecycle_status
        returning *
      ),
      event as (
        insert into school_attendance_lifecycle_events (
          school_id,
          lifecycle_id,
          actor_membership_id,
          event_type,
          effective_start_date,
          reason,
          created_at
        )
        select
          school_id,
          id,
          ${input.access.membership.id}::uuid,
          'ACTIVATED'::school_attendance_lifecycle_event_type,
          ${effectiveDate}::date,
          ${input.reason ?? null},
          now()
        from lifecycle
        returning id
      )
      select id
      from lifecycle
    `);

  if (
    rowsOf(result).length !==
      1
  ) {
    throw new AttendanceReadinessError(
      "Attendance lifecycle changed before activation completed.",
      409,
      "ATTENDANCE_LIFECYCLE_STATE_CHANGED",
    );
  }

  return getAttendanceLifecycle(
    input.access.school.id,
  );
}

export async function pauseAttendance(
  input: {
    access: SchoolAccess;
    reason?: string | null;
    scheduledResumeAt?:
      string | null;
  },
) {
  const current =
    await getAttendanceLifecycle(
      input.access.school.id,
    );

  if (
    current.status !==
      "ACTIVE"
  ) {
    throw new AttendanceReadinessError(
      "Only ACTIVE attendance can be paused.",
      409,
      "ATTENDANCE_LIFECYCLE_INVALID_TRANSITION",
    );
  }

  const scheduledResumeAt =
    input.scheduledResumeAt
      ? new Date(
          input.scheduledResumeAt,
        )
      : null;

  if (
    scheduledResumeAt &&
    (
      Number.isNaN(
        scheduledResumeAt.getTime(),
      ) ||
      scheduledResumeAt.getTime() <=
        Date.now()
    )
  ) {
    throw new AttendanceReadinessError(
      "Scheduled resume must be a valid future date and time.",
      400,
      "ATTENDANCE_SCHEDULED_RESUME_INVALID",
    );
  }

  const db = getDb();
  const open =
    await db.execute(sql`
      select id
      from attendance_sessions
      where
        school_id =
          ${input.access.school.id}::uuid
        and status =
          'OPEN'::attendance_session_status
      limit 1
    `);

  if (
    rowsOf(open).length >
      0
  ) {
    throw new AttendanceReadinessError(
      "Close the currently open attendance session before pausing attendance.",
      409,
      "ATTENDANCE_OPEN_SESSION_MUST_CLOSE",
    );
  }

  const result =
    await db.execute(sql`
      with lifecycle as (
        update school_attendance_lifecycles
        set
          status =
            'PAUSED'::school_attendance_lifecycle_status,
          paused_at = now(),
          paused_by_membership_id =
            ${input.access.membership.id}::uuid,
          scheduled_resume_at =
            ${scheduledResumeAt?.toISOString() ?? null}::timestamptz,
          scheduled_resume_by_membership_id =
            case
              when ${scheduledResumeAt?.toISOString() ?? null}::timestamptz is null
                then null
              else ${input.access.membership.id}::uuid
            end,
          scheduled_resume_reason =
            case
              when ${scheduledResumeAt?.toISOString() ?? null}::timestamptz is null
                then null
              else ${input.reason ?? null}
            end,
          updated_at = now()
        where
          school_id =
            ${input.access.school.id}::uuid
          and status =
            'ACTIVE'::school_attendance_lifecycle_status
        returning *
      ),
      event as (
        insert into school_attendance_lifecycle_events (
          school_id,
          lifecycle_id,
          actor_membership_id,
          event_type,
          effective_start_date,
          scheduled_for,
          reason,
          created_at
        )
        select
          school_id,
          id,
          ${input.access.membership.id}::uuid,
          'PAUSED'::school_attendance_lifecycle_event_type,
          effective_start_date,
          null,
          ${input.reason ?? null},
          now()
        from lifecycle
        returning id
      ),
      scheduled_event as (
        insert into school_attendance_lifecycle_events (
          school_id,
          lifecycle_id,
          actor_membership_id,
          event_type,
          effective_start_date,
          scheduled_for,
          reason,
          created_at
        )
        select
          school_id,
          id,
          ${input.access.membership.id}::uuid,
          'RESUME_SCHEDULED'::school_attendance_lifecycle_event_type,
          effective_start_date,
          scheduled_resume_at,
          scheduled_resume_reason,
          now()
        from lifecycle
        where scheduled_resume_at is not null
        returning id
      )
      select id
      from lifecycle
    `);

  if (
    rowsOf(result).length !==
      1
  ) {
    throw new AttendanceReadinessError(
      "Attendance lifecycle changed before pause completed.",
      409,
      "ATTENDANCE_LIFECYCLE_STATE_CHANGED",
    );
  }

  return getAttendanceLifecycle(
    input.access.school.id,
  );
}

export async function resumeAttendance(
  input: {
    access: SchoolAccess;
    reason?: string | null;
  },
) {
  const current =
    await getAttendanceLifecycle(
      input.access.school.id,
    );

  if (
    current.status !==
      "PAUSED" ||
    !current.effectiveStartDate
  ) {
    throw new AttendanceReadinessError(
      "Only previously activated PAUSED attendance can be resumed.",
      409,
      "ATTENDANCE_LIFECYCLE_INVALID_TRANSITION",
    );
  }

  const db = getDb();

  const result =
    await db.execute(sql`
      with lifecycle as (
        update school_attendance_lifecycles
        set
          status =
            'ACTIVE'::school_attendance_lifecycle_status,
          paused_at = null,
          paused_by_membership_id = null,
          scheduled_resume_at = null,
          scheduled_resume_by_membership_id = null,
          scheduled_resume_reason = null,
          updated_at = now()
        where
          school_id =
            ${input.access.school.id}::uuid
          and status =
            'PAUSED'::school_attendance_lifecycle_status
        returning *
      ),
      event as (
        insert into school_attendance_lifecycle_events (
          school_id,
          lifecycle_id,
          actor_membership_id,
          event_type,
          effective_start_date,
          scheduled_for,
          reason,
          created_at
        )
        select
          school_id,
          id,
          ${input.access.membership.id}::uuid,
          'RESUMED'::school_attendance_lifecycle_event_type,
          effective_start_date,
          null,
          ${input.reason ?? null},
          now()
        from lifecycle
        returning id
      )
      select id
      from lifecycle
    `);

  if (
    rowsOf(result).length !==
      1
  ) {
    throw new AttendanceReadinessError(
      "Attendance lifecycle changed before resume completed.",
      409,
      "ATTENDANCE_LIFECYCLE_STATE_CHANGED",
    );
  }

  return getAttendanceLifecycle(
    input.access.school.id,
  );
}

export async function scheduleAttendanceResume(
  input: {
    access: SchoolAccess;
    scheduledResumeAt: string;
    reason?: string | null;
  },
) {
  const scheduled =
    new Date(
      input.scheduledResumeAt,
    );

  if (
    Number.isNaN(
      scheduled.getTime(),
    ) ||
    scheduled.getTime() <=
      Date.now()
  ) {
    throw new AttendanceReadinessError(
      "Scheduled resume must be a valid future date and time.",
      400,
      "ATTENDANCE_SCHEDULED_RESUME_INVALID",
    );
  }

  const current =
    await getAttendanceLifecycle(
      input.access.school.id,
    );

  if (
    current.status !==
    "PAUSED"
  ) {
    throw new AttendanceReadinessError(
      "Attendance must be PAUSED before a resume can be scheduled.",
      409,
      "ATTENDANCE_LIFECYCLE_INVALID_TRANSITION",
    );
  }

  const db = getDb();
  const result =
    await db.execute(sql`
      with lifecycle as (
        update school_attendance_lifecycles
        set
          scheduled_resume_at =
            ${scheduled.toISOString()}::timestamptz,
          scheduled_resume_by_membership_id =
            ${input.access.membership.id}::uuid,
          scheduled_resume_reason =
            ${input.reason ?? null},
          updated_at = now()
        where
          school_id =
            ${input.access.school.id}::uuid
          and status =
            'PAUSED'::school_attendance_lifecycle_status
        returning *
      ),
      event as (
        insert into school_attendance_lifecycle_events (
          school_id,
          lifecycle_id,
          actor_membership_id,
          event_type,
          effective_start_date,
          scheduled_for,
          reason,
          created_at
        )
        select
          school_id,
          id,
          ${input.access.membership.id}::uuid,
          'RESUME_SCHEDULED'::school_attendance_lifecycle_event_type,
          effective_start_date,
          scheduled_resume_at,
          scheduled_resume_reason,
          now()
        from lifecycle
        returning id
      )
      select id
      from lifecycle
      where exists (
        select 1
        from event
      )
    `);

  if (
    rowsOf(result).length !== 1
  ) {
    throw new AttendanceReadinessError(
      "Attendance lifecycle changed before the scheduled resume was saved.",
      409,
      "ATTENDANCE_LIFECYCLE_STATE_CHANGED",
    );
  }

  return getAttendanceLifecycle(
    input.access.school.id,
  );
}

export async function cancelScheduledAttendanceResume(
  input: {
    access: SchoolAccess;
    reason?: string | null;
  },
) {
  const db = getDb();
  const result =
    await db.execute(sql`
      with lifecycle as (
        update school_attendance_lifecycles
        set
          scheduled_resume_at = null,
          scheduled_resume_by_membership_id = null,
          scheduled_resume_reason = null,
          updated_at = now()
        where
          school_id =
            ${input.access.school.id}::uuid
          and status =
            'PAUSED'::school_attendance_lifecycle_status
          and scheduled_resume_at is not null
        returning *
      ),
      event as (
        insert into school_attendance_lifecycle_events (
          school_id,
          lifecycle_id,
          actor_membership_id,
          event_type,
          effective_start_date,
          scheduled_for,
          reason,
          created_at
        )
        select
          school_id,
          id,
          ${input.access.membership.id}::uuid,
          'RESUME_SCHEDULE_CANCELLED'::school_attendance_lifecycle_event_type,
          effective_start_date,
          null,
          ${input.reason ?? null},
          now()
        from lifecycle
        returning id
      )
      select id
      from lifecycle
      where exists (
        select 1
        from event
      )
    `);

  if (
    rowsOf(result).length !== 1
  ) {
    throw new AttendanceReadinessError(
      "No scheduled attendance resume is available to cancel.",
      409,
      "ATTENDANCE_SCHEDULED_RESUME_NOT_FOUND",
    );
  }

  return getAttendanceLifecycle(
    input.access.school.id,
  );
}
