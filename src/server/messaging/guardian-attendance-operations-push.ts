import {
  randomUUID,
} from "node:crypto";

import {
  sql,
} from "drizzle-orm";

import {
  getDb,
} from "@/db";

function rowsOf<T>(
  value: unknown,
): T[] {
  if (
    Array.isArray(
      value,
    )
  ) {
    return value as T[];
  }

  if (
    value &&
    typeof value ===
      "object" &&
    "rows" in value
  ) {
    const rows =
      (
        value as {
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

export async function queueGuardianScheduledDismissalPushes(
  input: {
    schoolId: string;
    branchId: string;
    sessionId: string;
    branchSessionId: string;
  },
) {
  const db =
    getDb();
  const eventKey =
    `SCHOOL_NORMAL_DISMISSAL:${input.branchSessionId}`;
  const batchKey =
    eventKey;

  const result =
    await db.execute(sql`
      with dismissal as (
        select
          school.id
            as school_id,
          school.name
            as school_name,
          school.timezone
            as school_timezone,
          session.id
            as session_id,
          session.attendance_date,
          branch.id
            as branch_id,
          branch.name
            as branch_name,
          branch_session.id
            as branch_session_id,
          policy_day.normal_dismissal_at
        from attendance_branch_sessions
          branch_session
        join attendance_sessions
          session
          on session.school_id =
             branch_session.school_id
         and session.id =
             branch_session.session_id
        join schools
          school
          on school.id =
             branch_session.school_id
        join school_branches
          branch
          on branch.school_id =
             branch_session.school_id
         and branch.id =
             branch_session.branch_id
        join attendance_policy_days
          policy_day
          on policy_day.school_id =
             branch_session.school_id
         and policy_day.policy_id =
             branch_session.policy_id
         and policy_day.weekday =
             extract(
               dow from
               session.attendance_date
             )::int
        where
          branch_session.school_id =
            ${input.schoolId}::uuid
          and branch_session.branch_id =
            ${input.branchId}::uuid
          and branch_session.session_id =
            ${input.sessionId}::uuid
          and branch_session.id =
            ${input.branchSessionId}::uuid
          and branch_session.status in (
            'OPEN',
            'CLOSED'
          )
          and session.attendance_date =
            (
              now()
                at time zone
                school.timezone
            )::date
          and policy_day.normal_dismissal_at <=
            (
              now()
                at time zone
                school.timezone
            )::time
        limit 1
      ),
      eligible_students as (
        select distinct
          student.id
            as student_id
        from dismissal
        join student_enrollments
          enrollment
          on enrollment.school_id =
             dismissal.school_id
         and enrollment.status =
             'ACTIVE'::student_enrollment_status
         and enrollment.starts_on <=
             dismissal.attendance_date
         and (
           enrollment.ends_on
             is null
           or enrollment.ends_on >=
              dismissal.attendance_date
         )
        join school_branch_class_arms
          branch_map
          on branch_map.school_id =
             enrollment.school_id
         and branch_map.class_arm_id =
             enrollment.class_arm_id
         and branch_map.branch_id =
             dismissal.branch_id
        join students
          student
          on student.school_id =
             enrollment.school_id
         and student.id =
             enrollment.student_id
         and student.status =
             'ACTIVE'::student_status
      ),
      recipients as (
        select distinct on (
          relationship.guardian_id,
          device.firebase_installation_id
        )
          dismissal.school_id,
          dismissal.school_name,
          dismissal.school_timezone,
          dismissal.branch_id,
          dismissal.branch_name,
          dismissal.session_id,
          dismissal.attendance_date,
          dismissal.branch_session_id,
          dismissal.normal_dismissal_at,
          eligible.student_id,
          relationship.guardian_id,
          device.id
            as device_id,
          device.firebase_installation_id
        from dismissal
        join eligible_students
          eligible
          on true
        join student_guardians
          relationship
          on relationship.school_id =
             dismissal.school_id
         and relationship.student_id =
             eligible.student_id
         and relationship.receives_notifications =
             true
        join guardians
          guardian
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
          operational_event_key,
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
          ${eventKey},
          'SCHOOL_DAY_CLOSED',
          recipient.school_name ||
            ' · CASA',
          'Regular school hours at ' ||
            recipient.branch_name ||
            ' ended at ' ||
            to_char(
              recipient.attendance_date +
              recipient.normal_dismissal_at,
              'HH24:MI'
            ) ||
            ' today.',
          '/api/public/schools/' ||
            recipient.school_id::text ||
            '/notification-logo?branchId=' ||
            recipient.branch_id::text,
          '/',
          jsonb_build_object(
            'type',
              'SCHOOL_DAY_CLOSED',
            'eventType',
              'SCHOOL_DAY_CLOSED',
            'notificationKind',
              'NORMAL_DISMISSAL',
            'operationalEventKey',
              ${eventKey},
            'operationalBatchKey',
              ${batchKey},
            'schoolId',
              recipient.school_id::text,
            'branchId',
              recipient.branch_id::text,
            'branchName',
              recipient.branch_name,
            'sessionId',
              recipient.session_id::text,
            'branchSessionId',
              recipient.branch_session_id::text,
            'attendanceDate',
              recipient.attendance_date::text,
            'normalDismissalAt',
              recipient.normal_dismissal_at::text
          ),
          'PENDING',
          0,
          now(),
          now(),
          now()
        from recipients
          recipient
        on conflict (
          school_id,
          operational_event_key,
          guardian_id,
          firebase_installation_id
        )
        where
          operational_event_key
            is not null
        do nothing
        returning id
      )
      select
        count(*)::int
          as count
      from queued
    `);

  return {
    queued:
      Number(
        rowsOf<{
          count:
            unknown;
        }>(
          result,
        )[0]?.count ??
          0,
      ),
    batchKey,
  };
}

export async function queueGuardianLateStayPushes(
  input: {
    schoolId: string;
    branchId: string;
    authorizationIds:
      string[];
    batchKey?: string;
  },
) {
  const uniqueIds =
    Array.from(
      new Set(
        input.authorizationIds,
      ),
    );

  const batchKey =
    input.batchKey ??
    `LATE_STAY_BATCH:${randomUUID()}`;

  if (
    uniqueIds.length ===
      0
  ) {
    return {
      queued:
        0,
      batchKey,
    };
  }

  const db =
    getDb();

  const result =
    await db.execute(sql`
      with authorizations as (
        select
          authorization.id
            as authorization_id,
          authorization.school_id,
          authorization.session_id,
          authorization.branch_id,
          authorization.student_id,
          authorization.attendance_record_id,
          authorization.reason,
          authorization.allowed_until,
          school.name
            as school_name,
          school.timezone
            as school_timezone,
          branch.name
            as branch_name,
          concat_ws(
            ' ',
            student.first_name,
            nullif(
              student.middle_name,
              ''
            ),
            student.last_name
          ) as student_name
        from attendance_late_stay_authorizations
          authorization
        join schools
          school
          on school.id =
             authorization.school_id
        join school_branches
          branch
          on branch.school_id =
             authorization.school_id
         and branch.id =
             authorization.branch_id
        join students
          student
          on student.school_id =
             authorization.school_id
         and student.id =
             authorization.student_id
        where
          authorization.school_id =
            ${input.schoolId}::uuid
          and authorization.branch_id =
            ${input.branchId}::uuid
          and authorization.id in (
            select
              value::uuid
            from jsonb_array_elements_text(
              ${JSON.stringify(uniqueIds)}::jsonb
            )
          )
          and authorization.revoked_at
            is null
          and authorization.consumed_at
            is null
          and authorization.allowed_until >
            now()
      ),
      recipients as (
        select
          authorization.*,
          relationship.guardian_id,
          device.id
            as device_id,
          device.firebase_installation_id
        from authorizations
          authorization
        join student_guardians
          relationship
          on relationship.school_id =
             authorization.school_id
         and relationship.student_id =
             authorization.student_id
         and relationship.receives_notifications =
             true
        join guardians
          guardian
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
          operational_event_key,
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
          recipient.attendance_record_id,
          null,
          recipient.firebase_installation_id,
          'STUDENT_LATE_STAY_AUTHORIZED:' ||
            recipient.authorization_id::text,
          'STUDENT_LATE_STAY_AUTHORIZED',
          recipient.school_name ||
            ' · CASA',
          recipient.student_name ||
            ' will remain at ' ||
            recipient.branch_name ||
            ' after regular closing until ' ||
            to_char(
              recipient.allowed_until
                at time zone
                recipient.school_timezone,
              'HH24:MI'
            ) ||
            '. Reason: ' ||
            recipient.reason ||
            '. The student remains under school supervision during this approved period.',
          '/api/public/schools/' ||
            recipient.school_id::text ||
            '/notification-logo?branchId=' ||
            recipient.branch_id::text,
          '/',
          jsonb_build_object(
            'type',
              'STUDENT_LATE_STAY_AUTHORIZED',
            'eventType',
              'STUDENT_LATE_STAY_AUTHORIZED',
            'operationalEventKey',
              'STUDENT_LATE_STAY_AUTHORIZED:' ||
              recipient.authorization_id::text,
            'operationalBatchKey',
              ${batchKey},
            'lateStayAuthorizationId',
              recipient.authorization_id::text,
            'studentId',
              recipient.student_id::text,
            'studentName',
              recipient.student_name,
            'branchId',
              recipient.branch_id::text,
            'branchName',
              recipient.branch_name,
            'reason',
              recipient.reason,
            'allowedUntil',
              recipient.allowed_until::text
          ),
          'PENDING',
          0,
          now(),
          now(),
          now()
        from recipients
          recipient
        on conflict (
          school_id,
          operational_event_key,
          guardian_id,
          firebase_installation_id
        )
        where
          operational_event_key
            is not null
        do nothing
        returning id
      )
      select
        count(*)::int
          as count
      from queued
    `);

  return {
    queued:
      Number(
        rowsOf<{
          count:
            unknown;
        }>(
          result,
        )[0]?.count ??
          0,
      ),
    batchKey,
  };
}

export async function reconcileRecentGuardianAttendanceOperationalPushes(
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
  const legacyManualClosureSchoolFilter =
    input.schoolId
      ? sql`and outbox.school_id = ${input.schoolId}::uuid`
      : sql``;

  await db.execute(sql`
    update guardian_push_outbox
      outbox
    set
      status = 'CANCELLED',
      locked_at = null,
      last_error =
        coalesce(
          outbox.last_error,
          'Superseded by scheduled normal-dismissal guardian notification truth.'
        ),
      updated_at = now()
    where
      outbox.operational_event_key
        like 'SCHOOL_DAY_CLOSED:%'
      and outbox.device_displayed_at
        is null
      and outbox.status in (
        'PENDING',
        'RETRY',
        'FAILED',
        'SENT',
        'PROCESSING'
      )
      ${legacyManualClosureSchoolFilter}
  `);

  const schoolFilter =
    input.schoolId
      ? sql`and branch_session.school_id = ${input.schoolId}::uuid`
      : sql``;

  const dueDismissals =
    rowsOf<{
      school_id:
        string;
      branch_id:
        string;
      session_id:
        string;
      branch_session_id:
        string;
    }>(
      await db.execute(sql`
        select
          branch_session.school_id::text,
          branch_session.branch_id::text,
          branch_session.session_id::text,
          branch_session.id::text
            as branch_session_id
        from attendance_branch_sessions
          branch_session
        join attendance_sessions
          session
          on session.school_id =
             branch_session.school_id
         and session.id =
             branch_session.session_id
        join schools
          school
          on school.id =
             branch_session.school_id
        join attendance_policy_days
          policy_day
          on policy_day.school_id =
             branch_session.school_id
         and policy_day.policy_id =
             branch_session.policy_id
         and policy_day.weekday =
             extract(
               dow from
               session.attendance_date
             )::int
        where
          branch_session.status in (
            'OPEN',
            'CLOSED'
          )
          and session.attendance_date =
            (
              now()
                at time zone
                school.timezone
            )::date
          and policy_day.normal_dismissal_at <=
            (
              now()
                at time zone
                school.timezone
            )::time
          ${schoolFilter}
        order by
          policy_day.normal_dismissal_at
            desc
        limit ${limit}
      `),
    );

  let queued =
    0;

  for (
    const dismissal of
      dueDismissals
  ) {
    try {
      queued +=
        (
          await queueGuardianScheduledDismissalPushes({
            schoolId:
              dismissal.school_id,
            branchId:
              dismissal.branch_id,
            sessionId:
              dismissal.session_id,
            branchSessionId:
              dismissal.branch_session_id,
          })
        ).queued;
    } catch {
      // The next scheduled worker run can retry reconstruction.
    }
  }

  const lateStaySchoolFilter =
    input.schoolId
      ? sql`and authorization.school_id = ${input.schoolId}::uuid`
      : sql``;

  const lateStays =
    rowsOf<{
      school_id:
        string;
      branch_id:
        string;
      authorization_id:
        string;
    }>(
      await db.execute(sql`
        select
          authorization.school_id::text,
          authorization.branch_id::text,
          authorization.id::text
            as authorization_id
        from attendance_late_stay_authorizations
          authorization
        where
          authorization.revoked_at
            is null
          and authorization.consumed_at
            is null
          and authorization.allowed_until >
            now()
          and authorization.created_at >=
            now() - interval '2 days'
          ${lateStaySchoolFilter}
        order by
          authorization.created_at
            desc
        limit ${limit}
      `),
    );

  const grouped =
    new Map<
      string,
      {
        schoolId:
          string;
        branchId:
          string;
        authorizationIds:
          string[];
      }
    >();

  for (
    const lateStay of
      lateStays
  ) {
    const key =
      `${lateStay.school_id}:${lateStay.branch_id}`;
    const current =
      grouped.get(
        key,
      ) ?? {
        schoolId:
          lateStay.school_id,
        branchId:
          lateStay.branch_id,
        authorizationIds:
          [],
      };

    current.authorizationIds
      .push(
        lateStay.authorization_id,
      );

    grouped.set(
      key,
      current,
    );
  }

  for (
    const group of
      grouped.values()
  ) {
    try {
      queued +=
        (
          await queueGuardianLateStayPushes({
            ...group,
            batchKey:
              `LATE_STAY_RECONCILE:${randomUUID()}`,
          })
        ).queued;
    } catch {
      // The next scheduled worker run can retry reconstruction.
    }
  }

  return queued;
}
