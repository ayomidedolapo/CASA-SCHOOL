import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  findNextInstructionalDate,
} from "@/server/attendance/readiness";
import {
  getSchoolClock,
} from "@/server/attendance/terminal-session";
import {
  SchoolOperationsError,
} from "@/server/school-operations/errors";

export type SchoolCalendarClosure = {
  id: string;
  kind:
    | "PUBLIC_HOLIDAY"
    | "SCHOOL_BREAK"
    | "BRANCH_CLOSURE"
    | "SPECIAL_NON_INSTRUCTIONAL_DAY";
  title: string;
  startsOn: string;
  endsOn: string;
  notes: string | null;
  branchId: string | null;
  branchName: string | null;
  scope: "SCHOOL" | "BRANCH";
  durationDays: number;
  nextInstructionalDate: string | null;
  updatedAt: string;
};

function rowsOf<T>(
  result: unknown,
): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result
  ) {
    const rows =
      (
        result as {
          rows?: unknown;
        }
      ).rows;

    if (Array.isArray(rows)) {
      return rows as T[];
    }
  }

  return [];
}

export function calendarClosureMessage(
  closure: SchoolCalendarClosure,
) {
  const scope =
    closure.scope === "BRANCH"
      ? `${closure.branchName ?? "This campus"}`
      : "The school";
  const until =
    closure.startsOn ===
    closure.endsOn
      ? closure.endsOn
      : `${closure.startsOn} through ${closure.endsOn}`;
  const resume =
    closure.nextInstructionalDate
      ? ` Attendance resumes on ${closure.nextInstructionalDate}.`
      : " Attendance resumes on the next instructional day after the closure.";

  return `${scope} is closed for ${closure.title} (${until}).${resume}`;
}

export async function getActiveCalendarClosure(
  input: {
    schoolId: string;
    date: string;
    branchIds?: string[];
    includeNextInstructionalDate?: boolean;
  },
): Promise<SchoolCalendarClosure | null> {
  const branchIds =
    Array.from(
      new Set(
        (
          input.branchIds ??
          []
        ).filter(Boolean),
      ),
    );
  const db =
    getDb();
  const branchPredicate =
    branchIds.length > 0
      ? sql`(
          event.branch_id is null
          or event.branch_id in (
            select value::uuid
            from jsonb_array_elements_text(
              ${JSON.stringify(branchIds)}::jsonb
            )
          )
        )`
      : sql`event.branch_id is null`;

  const row =
    rowsOf<{
      id: string;
      kind:
        SchoolCalendarClosure["kind"];
      title: string;
      starts_on: string;
      ends_on: string;
      notes: string | null;
      branch_id: string | null;
      branch_name: string | null;
      duration_days: number;
      updated_at: string | Date;
    }>(
      await db.execute(sql`
        select
          event.id::text,
          event.kind::text as kind,
          event.title,
          event.starts_on::text,
          event.ends_on::text,
          event.notes,
          event.branch_id::text,
          branch.name as branch_name,
          (
            event.ends_on -
            event.starts_on +
            1
          )::int as duration_days,
          event.updated_at
        from school_calendar_events event
        left join school_branches branch
          on branch.school_id =
             event.school_id
         and branch.id =
             event.branch_id
        where
          event.school_id =
            ${input.schoolId}::uuid
          and event.starts_on <=
            ${input.date}::date
          and event.ends_on >=
            ${input.date}::date
          and ${branchPredicate}
        order by
          case
            when event.branch_id is null
              then 0
            else 1
          end,
          event.starts_on asc,
          event.created_at asc
        limit 1
      `),
    )[0];

  if (!row) {
    return null;
  }

  let nextInstructionalDate:
    string | null =
      null;

  if (
    input.includeNextInstructionalDate !==
      false
  ) {
    try {
      nextInstructionalDate =
        await findNextInstructionalDate({
          schoolId:
            input.schoolId,
          afterDate:
            row.ends_on,
          branchId:
            row.branch_id ??
            branchIds[0] ??
            null,
        });
    } catch {
      nextInstructionalDate =
        null;
    }
  }

  return {
    id:
      row.id,
    kind:
      row.kind,
    title:
      row.title,
    startsOn:
      row.starts_on,
    endsOn:
      row.ends_on,
    notes:
      row.notes,
    branchId:
      row.branch_id,
    branchName:
      row.branch_name,
    scope:
      row.branch_id
        ? "BRANCH"
        : "SCHOOL",
    durationDays:
      Number(
        row.duration_days,
      ),
    nextInstructionalDate,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(
            row.updated_at,
          ).toISOString(),
  };
}

export async function getCurrentCalendarClosure(
  input: {
    schoolId: string;
    timezone: string;
    branchIds?: string[];
    includeNextInstructionalDate?: boolean;
  },
) {
  const clock =
    getSchoolClock(
      new Date(),
      input.timezone,
    );

  return getActiveCalendarClosure({
    schoolId:
      input.schoolId,
    date:
      clock.date,
    branchIds:
      input.branchIds,
    includeNextInstructionalDate:
      input.includeNextInstructionalDate,
  });
}

export async function assertCalendarEventCanActivate(
  input: {
    schoolId: string;
    timezone: string;
    branchId: string | null;
    startsOn: string;
    endsOn: string;
  },
) {
  const clock =
    getSchoolClock(
      new Date(),
      input.timezone,
    );

  if (
    clock.date <
      input.startsOn ||
    clock.date >
      input.endsOn
  ) {
    return;
  }

  const db =
    getDb();

  const open =
    input.branchId
      ? rowsOf<{ id: string }>(
          await db.execute(sql`
            select
              branch_session.id::text
            from attendance_sessions session
            join attendance_branch_sessions
              branch_session
              on branch_session.school_id =
                 session.school_id
             and branch_session.session_id =
                 session.id
            where
              session.school_id =
                ${input.schoolId}::uuid
              and session.attendance_date =
                ${clock.date}::date
              and branch_session.branch_id =
                ${input.branchId}::uuid
              and branch_session.status =
                'OPEN'
            limit 1
          `),
        )[0]
      : rowsOf<{ id: string }>(
          await db.execute(sql`
            select
              session.id::text
            from attendance_sessions session
            where
              session.school_id =
                ${input.schoolId}::uuid
              and session.attendance_date =
                ${clock.date}::date
              and (
                session.status =
                  'OPEN'::attendance_session_status
                or exists (
                  select 1
                  from attendance_branch_sessions
                    branch_session
                  where
                    branch_session.school_id =
                      session.school_id
                    and branch_session.session_id =
                      session.id
                    and branch_session.status =
                      'OPEN'
                )
              )
            limit 1
          `),
        )[0];

  if (open) {
    throw new SchoolOperationsError(
      input.branchId
        ? "Close today's attendance for this campus before creating a calendar closure that is already in effect."
        : "Close all currently open attendance for today before creating a school-wide calendar closure that is already in effect.",
      409,
      "CALENDAR_EVENT_ACTIVE_ATTENDANCE_CONFLICT",
    );
  }
}
