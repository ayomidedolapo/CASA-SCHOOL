import {
  sql,
} from "drizzle-orm";

import {
  getDb,
} from "@/db";

export type GuardianPresencePushEvent =
  | "STUDENT_CHECKED_IN"
  | "STUDENT_SIGNED_OUT"
  | "STUDENT_EARLY_DEPARTURE";

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
    "rows" in result
  ) {
    const rows =
      (
        result as {
          rows?: unknown;
        }
      ).rows;

    if (
      Array.isArray(
        rows,
      )
    ) {
      return rows as T[];
    }
  }

  return [];
}

export async function queueGuardianPresencePushBestEffort(
  input: {
    schoolId: string;
    studentId: string;
    attendanceRecordId:
      string;
    presenceEventId:
      string;
    eventType:
      GuardianPresencePushEvent;
  },
): Promise<number> {
  try {
    const result =
      await getDb()
        .execute(sql`
          with context as (
            select
              school.id
                as school_id,
              school.name
                as school_name,
              student.id
                as student_id,
              concat_ws(
                ' ',
                student.first_name,
                nullif(
                  student.middle_name,
                  ''
                ),
                student.last_name
              ) as student_name,
              event.occurred_at
                as occurred_at
            from schools school
            join students student
              on student.school_id =
                 school.id
             and student.id =
                 ${input.studentId}::uuid
            join student_presence_events event
              on event.school_id =
                 school.id
             and event.student_id =
                 student.id
             and event.id =
                 ${input.presenceEventId}::uuid
            where
              school.id =
                ${input.schoolId}::uuid
            limit 1
          ),
          recipients as (
            select
              context.school_id,
              context.school_name,
              context.student_id,
              context.student_name,
              context.occurred_at,
              guardian.id
                as guardian_id,
              device.id
                as device_id,
              device.firebase_installation_id
                as firebase_installation_id
            from context
            join student_guardians relationship
              on relationship.school_id =
                 context.school_id
             and relationship.student_id =
                 context.student_id
             and relationship.receives_notifications =
                 true
            join guardians guardian
              on guardian.school_id =
                 relationship.school_id
             and guardian.id =
                 relationship.guardian_id
             and guardian.status =
                 'ACTIVE'::guardian_status
            join guardian_push_devices device
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
          ),
          inserted as (
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
              recipients.school_id,
              recipients.student_id,
              recipients.guardian_id,
              recipients.device_id,
              ${input.attendanceRecordId}::uuid,
              ${input.presenceEventId}::uuid,
              recipients.firebase_installation_id,
              ${input.eventType},
              recipients.school_name ||
                ' · CASA',
              case
                when ${input.eventType} =
                  'STUDENT_CHECKED_IN'
                  then
                    recipients.student_name ||
                    ' checked in.'
                when ${input.eventType} =
                  'STUDENT_SIGNED_OUT'
                  then
                    recipients.student_name ||
                    ' signed out.'
                else
                  recipients.student_name ||
                  ' checked out early.'
              end,
              '/api/public/schools/' ||
                recipients.school_id::text ||
                '/notification-logo',
              '/',
              jsonb_build_object(
                'type',
                  ${input.eventType},
                'studentId',
                  recipients.student_id,
                'studentName',
                  recipients.student_name,
                'attendanceRecordId',
                  ${input.attendanceRecordId},
                'presenceEventId',
                  ${input.presenceEventId},
                'occurredAt',
                  recipients.occurred_at
              ),
              'PENDING',
              0,
              now(),
              now(),
              now()
            from recipients
            on conflict do nothing
            returning id
          )
          select
            count(*)::int
              as count
          from inserted
        `);

    return Number(
      rowsOf<{
        count:
          unknown;
      }>(
        result,
      )[0]?.count ??
        0,
    );
  } catch {
    // Attendance must remain authoritative even if push queueing is
    // temporarily unavailable. A zero count is surfaced to the scanner.
    return 0;
  }
}

export async function reconcileRecentGuardianPresencePushes(
  input: {
    schoolId?: string;
    presenceEventId?: string;
    lookbackMinutes?: number;
    limit?: number;
  } = {},
): Promise<number> {
  const lookbackMinutes =
    Math.min(
      180,
      Math.max(
        5,
        input.lookbackMinutes ??
          120,
      ),
    );
  const limit =
    Math.min(
      200,
      Math.max(
        1,
        input.limit ??
          100,
      ),
    );

  try {
    const schoolFilter =
      input.schoolId
        ? sql`and event.school_id = ${input.schoolId}::uuid`
        : sql``;
    const presenceEventFilter =
      input.presenceEventId
        ? sql`and event.id = ${input.presenceEventId}::uuid`
        : sql``;

    const result =
      await getDb()
        .execute(sql`
          with recent_events as (
            select
              event.school_id,
              school.name
                as school_name,
              event.student_id,
              concat_ws(
                ' ',
                student.first_name,
                nullif(
                  student.middle_name,
                  ''
                ),
                student.last_name
              ) as student_name,
              event.attendance_record_id,
              event.id
                as presence_event_id,
              event.occurred_at,
              case
                when event.event_type =
                  'CHECKED_IN'::attendance_presence_event_type
                  then
                    'STUDENT_CHECKED_IN'
                when event.departure_result =
                  'EARLY'::attendance_departure_result
                  then
                    'STUDENT_EARLY_DEPARTURE'
                else
                  'STUDENT_SIGNED_OUT'
              end
                as guardian_event_type
            from student_presence_events event
            join schools school
              on school.id =
                 event.school_id
            join students student
              on student.school_id =
                 event.school_id
             and student.id =
                 event.student_id
            where
              event.occurred_at >=
                now() -
                (
                  ${lookbackMinutes} *
                  interval '1 minute'
                )
              ${schoolFilter}
              ${presenceEventFilter}
            order by
              event.occurred_at desc
            limit ${limit}
          ),
          recipients as (
            select
              context.school_id,
              context.school_name,
              context.student_id,
              context.student_name,
              context.attendance_record_id,
              context.presence_event_id,
              context.occurred_at,
              context.guardian_event_type,
              guardian.id
                as guardian_id,
              device.id
                as device_id,
              device.firebase_installation_id
                as firebase_installation_id
            from recent_events context
            join student_guardians relationship
              on relationship.school_id =
                 context.school_id
             and relationship.student_id =
                 context.student_id
             and relationship.receives_notifications =
                 true
            join guardians guardian
              on guardian.school_id =
                 relationship.school_id
             and guardian.id =
                 relationship.guardian_id
             and guardian.status =
                 'ACTIVE'::guardian_status
            join guardian_push_devices device
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
          ),
          inserted as (
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
              recipients.school_id,
              recipients.student_id,
              recipients.guardian_id,
              recipients.device_id,
              recipients.attendance_record_id,
              recipients.presence_event_id,
              recipients.firebase_installation_id,
              recipients.guardian_event_type,
              recipients.school_name ||
                ' · CASA',
              case
                when recipients.guardian_event_type =
                  'STUDENT_CHECKED_IN'
                  then
                    recipients.student_name ||
                    ' checked in.'
                when recipients.guardian_event_type =
                  'STUDENT_SIGNED_OUT'
                  then
                    recipients.student_name ||
                    ' signed out.'
                else
                  recipients.student_name ||
                  ' checked out early.'
              end,
              '/api/public/schools/' ||
                recipients.school_id::text ||
                '/notification-logo',
              '/',
              jsonb_build_object(
                'type',
                  recipients.guardian_event_type,
                'studentId',
                  recipients.student_id,
                'studentName',
                  recipients.student_name,
                'attendanceRecordId',
                  recipients.attendance_record_id,
                'presenceEventId',
                  recipients.presence_event_id,
                'occurredAt',
                  recipients.occurred_at
              ),
              'PENDING',
              0,
              now(),
              now(),
              now()
            from recipients
            on conflict do nothing
            returning id
          )
          select
            count(*)::int
              as count
          from inserted
        `);

    return Number(
      rowsOf<{
        count:
          unknown;
      }>(
        result,
      )[0]?.count ??
        0,
    );
  } catch {
    return 0;
  }
}
