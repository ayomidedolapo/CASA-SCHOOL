import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  findNextInstructionalDate,
} from "@/server/attendance/readiness";

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

function asDate(
  value: string | Date,
) {
  return value instanceof Date
    ? value
    : new Date(
        value,
      );
}

function formatDate(
  date: string,
) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(
    new Date(
      `${date}T00:00:00.000Z`,
    ),
  );
}

export async function syncGuardianCalendarEventPushes(
  input: {
    schoolId: string;
    eventId: string;
  },
) {
  const db =
    getDb();

  const event =
    rowsOf<{
      id: string;
      school_id: string;
      school_name: string;
      school_slug: string;
      school_timezone: string;
      branch_id: string | null;
      branch_name: string | null;
      kind: string;
      title: string;
      starts_on: string;
      ends_on: string;
      notes: string | null;
      updated_at: string | Date;
      reminder_at: string | Date;
    }>(
      await db.execute(sql`
        select
          event.id::text,
          event.school_id::text,
          school.name
            as school_name,
          school.slug
            as school_slug,
          school.timezone
            as school_timezone,
          event.branch_id::text,
          branch.name
            as branch_name,
          event.kind::text
            as kind,
          event.title,
          event.starts_on::text,
          event.ends_on::text,
          event.notes,
          event.updated_at,
          (
            (
              event.starts_on -
              1
            )::date +
            time '08:00'
          ) at time zone
            school.timezone
            as reminder_at
        from school_calendar_events
          event
        join schools school
          on school.id =
             event.school_id
        left join school_branches
          branch
          on branch.school_id =
             event.school_id
         and branch.id =
             event.branch_id
        where
          event.school_id =
            ${input.schoolId}::uuid
          and event.id =
            ${input.eventId}::uuid
        limit 1
      `),
    )[0];

  if (!event) {
    return 0;
  }

  let resumptionDate:
    string | null =
      null;

  try {
    resumptionDate =
      await findNextInstructionalDate({
        schoolId:
          event.school_id,
        afterDate:
          event.ends_on,
        branchId:
          event.branch_id,
      });
  } catch {
    resumptionDate =
      null;
  }

  const revision =
    asDate(
      event.updated_at,
    ).toISOString();
  const reminderAt =
    asDate(
      event.reminder_at,
    );
  const availableAt =
    reminderAt.getTime() >
      Date.now()
      ? reminderAt.toISOString()
      : new Date().toISOString();
  const scopeLabel =
    event.branch_id
      ? `${event.branch_name ?? "This campus"} campus`
      : "the whole school";
  const dateRange =
    event.starts_on ===
      event.ends_on
      ? formatDate(
          event.starts_on,
        )
      : `${formatDate(
          event.starts_on,
        )} - ${formatDate(
          event.ends_on,
        )}`;
  const reason =
    event.notes?.trim()
      ? ` Reason: ${event.notes.trim()}.`
      : "";
  const resume =
    resumptionDate
      ? ` Classes and attendance resume on ${formatDate(
          resumptionDate,
        )}.`
      : "";
  const body =
    `${event.title}: ${scopeLabel} will be closed ${dateRange}.${reason}${resume}`;
  const title =
    `${event.school_name} - school calendar notice`;
  const iconUrl =
    event.branch_id
      ? `/api/public/schools/${encodeURIComponent(
          event.school_id,
        )}/notification-logo?branchId=${encodeURIComponent(
          event.branch_id,
        )}`
      : `/api/public/schools/${encodeURIComponent(
          event.school_id,
        )}/notification-logo`;
  const clickUrl =
    `/schools/${encodeURIComponent(
      event.school_slug,
    )}/calendar`;

  await db.execute(sql`
    delete from guardian_push_outbox
    where
      school_id =
        ${event.school_id}::uuid
      and event_type =
        'SCHOOL_CALENDAR_NOTICE'
      and payload ->>
        'calendarEventId' =
        ${event.id}
      and status in (
        'PENDING',
        'RETRY',
        'FAILED'
      )
      and coalesce(
        payload ->>
          'calendarEventRevision',
        ''
      ) <>
        ${revision}
  `);

  await db.execute(sql`
    delete from guardian_push_outbox
      outbox
    where
      outbox.school_id =
        ${event.school_id}::uuid
      and outbox.event_type =
        'SCHOOL_CALENDAR_NOTICE'
      and outbox.payload ->>
        'calendarEventId' =
        ${event.id}
      and outbox.payload ->>
        'calendarEventRevision' =
        ${revision}
      and outbox.status in (
        'PENDING',
        'RETRY',
        'FAILED'
      )
      and not exists (
        select 1
        from guardian_push_devices
          device
        join student_guardians
          relationship
          on relationship.school_id =
             device.school_id
         and relationship.id =
             device.student_guardian_link_id
         and relationship.student_id =
             device.student_id
         and relationship.guardian_id =
             device.guardian_id
         and relationship.receives_notifications =
             true
        join guardians guardian
          on guardian.school_id =
             relationship.school_id
         and guardian.id =
             relationship.guardian_id
         and guardian.status =
             'ACTIVE'::guardian_status
        where
          device.id =
            outbox.device_id
          and device.school_id =
            outbox.school_id
          and device.status =
            'ACTIVE'
      )
  `);

  const inserted =
    await db.execute(sql`
      with eligible_students as (
        select distinct
          student.id
            as student_id,
          branch_map.branch_id
            as branch_id
        from students student
        join student_enrollments
          enrollment
          on enrollment.school_id =
             student.school_id
         and enrollment.student_id =
             student.id
         and enrollment.status =
             'ACTIVE'::student_enrollment_status
        join school_branch_class_arms
          branch_map
          on branch_map.school_id =
             enrollment.school_id
         and branch_map.class_arm_id =
             enrollment.class_arm_id
        where
          student.school_id =
            ${event.school_id}::uuid
          and student.status =
            'ACTIVE'::student_status
          and enrollment.starts_on <=
            ${event.ends_on}::date
          and (
            enrollment.ends_on is null
            or enrollment.ends_on >=
               ${event.starts_on}::date
          )
          and (
            ${event.branch_id}::uuid
              is null
            or branch_map.branch_id =
               ${event.branch_id}::uuid
          )
      ),
      recipients as (
        select distinct on (
          relationship.guardian_id,
          device.firebase_installation_id
        )
          device.school_id,
          device.student_id,
          device.guardian_id,
          device.id
            as device_id,
          device.firebase_installation_id,
          device.branch_id
        from eligible_students
          eligible
        join student_guardians
          relationship
          on relationship.school_id =
             ${event.school_id}::uuid
         and relationship.student_id =
             eligible.student_id
         and relationship.receives_notifications =
             true
        join guardians guardian
          on guardian.school_id =
             relationship.school_id
         and guardian.id =
             relationship.guardian_id
         and guardian.status =
             'ACTIVE'::guardian_status
        join guardian_push_devices
          device
          on device.school_id =
             relationship.school_id
         and device.student_id =
             relationship.student_id
         and device.guardian_id =
             relationship.guardian_id
         and device.student_guardian_link_id =
             relationship.id
         and device.status =
             'ACTIVE'
        order by
          relationship.guardian_id,
          device.firebase_installation_id,
          device.last_seen_at desc
            nulls last,
          device.created_at desc
      ),
      queued as (
        insert into guardian_push_outbox (
          school_id,
          student_id,
          guardian_id,
          device_id,
          attendance_record_id,
          presence_event_id,
          firebase_installation_id,
          event_type,
          title,
          body,
          icon_url,
          click_url,
          payload,
          status,
          attempt_count,
          available_at,
          created_at,
          updated_at
        )
        select
          recipient.school_id,
          recipient.student_id,
          recipient.guardian_id,
          recipient.device_id,
          null,
          null,
          recipient.firebase_installation_id,
          'SCHOOL_CALENDAR_NOTICE',
          ${title},
          ${body},
          ${iconUrl},
          ${clickUrl},
          jsonb_build_object(
            'type',
              'SCHOOL_CALENDAR_NOTICE',
            'calendarEventId',
              ${event.id},
            'calendarEventRevision',
              ${revision},
            'calendarEventKind',
              ${event.kind},
            'calendarEventTitle',
              ${event.title},
            'startsOn',
              ${event.starts_on},
            'endsOn',
              ${event.ends_on},
            'branchId',
              ${event.branch_id},
            'branchName',
              ${event.branch_name},
            'scope',
              ${
                event.branch_id
                  ? "BRANCH"
                  : "SCHOOL"
              },
            'resumptionDate',
              ${resumptionDate}
          ),
          'PENDING',
          0,
          ${availableAt}::timestamptz,
          now(),
          now()
        from recipients
          recipient
        where not exists (
          select 1
          from guardian_push_outbox
            existing
          where
            existing.school_id =
              recipient.school_id
            and existing.guardian_id =
              recipient.guardian_id
            and existing.firebase_installation_id =
              recipient.firebase_installation_id
            and existing.event_type =
              'SCHOOL_CALENDAR_NOTICE'
            and existing.payload ->>
              'calendarEventId' =
              ${event.id}
            and existing.payload ->>
              'calendarEventRevision' =
              ${revision}
            and existing.status in (
              'PENDING',
              'PROCESSING',
              'RETRY',
              'SENT'
            )
        )
        returning id
      )
      select
        count(*)::int
          as count
      from queued
    `);

  return Number(
    rowsOf<{
      count: unknown;
    }>(
      inserted,
    )[0]?.count ??
      0,
  );
}

export async function reconcileDueGuardianCalendarPushes(
  input: {
    schoolId?: string;
    limit?: number;
  } = {},
) {
  const db =
    getDb();
  const limit =
    Math.min(
      100,
      Math.max(
        1,
        input.limit ??
          50,
      ),
    );
  const schoolFilter =
    input.schoolId
      ? sql`and event.school_id = ${input.schoolId}::uuid`
      : sql``;

  const events =
    rowsOf<{
      school_id: string;
      event_id: string;
    }>(
      await db.execute(sql`
        select
          event.school_id::text,
          event.id::text
            as event_id
        from school_calendar_events
          event
        join schools school
          on school.id =
             event.school_id
        where
          event.ends_on >=
            (
              now() at time zone
                school.timezone
            )::date
          and event.starts_on <=
            (
              (
                now() at time zone
                  school.timezone
              )::date +
              1
            )
          ${schoolFilter}
        order by
          event.starts_on asc,
          event.created_at asc
        limit ${limit}
      `),
    );

  let queued =
    0;

  for (
    const event of events
  ) {
    try {
      queued +=
        await syncGuardianCalendarEventPushes({
          schoolId:
            event.school_id,
          eventId:
            event.event_id,
        });
    } catch {
      // Scheduled reconciliation is best-effort. The next worker run retries.
    }
  }

  return queued;
}
