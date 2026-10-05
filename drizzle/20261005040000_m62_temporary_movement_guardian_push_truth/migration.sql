-- CASA M62 Temporary Movement Guardian Push Truth
-- Closes the live mismatch where TEMPORARY_EXITED / TEMPORARY_RETURNED presence
-- events were queued by the legacy M34B DB trigger as STUDENT_SIGNED_OUT.
-- Preserves existing attendance, Summer, and calendar guardian-push event types.

alter table guardian_push_outbox
  drop constraint if exists guardian_push_outbox_event_type_check,
  add constraint guardian_push_outbox_event_type_check
  check (
    event_type in (
      'STUDENT_CHECKED_IN',
      'STUDENT_SIGNED_OUT',
      'STUDENT_EARLY_DEPARTURE',
      'STUDENT_TEMPORARILY_OUT',
      'STUDENT_RETURNED_TO_CAMPUS',
      'SUMMER_PRESENT',
      'SUMMER_LATE',
      'SUMMER_SIGNED_OUT',
      'SCHOOL_CALENDAR_NOTICE'
    )
  );
-- CASA_STATEMENT_BREAK

create or replace function casa_guardian_push_from_presence_event()
returns trigger
language plpgsql
as $$
declare
  v_event_type varchar(40);
begin
  v_event_type := case
    when NEW.event_type::text = 'CHECKED_IN'
      then 'STUDENT_CHECKED_IN'
    when NEW.event_type::text = 'TEMPORARY_EXITED'
      then 'STUDENT_TEMPORARILY_OUT'
    when NEW.event_type::text = 'TEMPORARY_RETURNED'
      then 'STUDENT_RETURNED_TO_CAMPUS'
    when NEW.departure_result::text = 'EARLY'
      then 'STUDENT_EARLY_DEPARTURE'
    else 'STUDENT_SIGNED_OUT'
  end;

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
    NEW.school_id,
    NEW.student_id,
    device.guardian_id,
    device.id,
    NEW.attendance_record_id,
    NEW.id,
    device.firebase_installation_id,
    v_event_type,
    school.name || ' · Attendance',
    case
      when v_event_type = 'STUDENT_CHECKED_IN'
        then student_name.name ||
          ' checked in at ' ||
          to_char(
            NEW.occurred_at at time zone school.timezone,
            'HH24:MI'
          ) ||
          '.'
      when v_event_type = 'STUDENT_TEMPORARILY_OUT'
        then student_name.name ||
          ' stepped out briefly from school at ' ||
          to_char(
            NEW.occurred_at at time zone school.timezone,
            'HH24:MI'
          ) ||
          ' and is expected back on campus soon. Reason: ' ||
          coalesce(
            nullif(
              trim(NEW.reason),
              ''
            ),
            'Not stated'
          ) ||
          '.'
      when v_event_type = 'STUDENT_RETURNED_TO_CAMPUS'
        then student_name.name ||
          ' is now back on the school campus premises at ' ||
          to_char(
            NEW.occurred_at at time zone school.timezone,
            'HH24:MI'
          ) ||
          '.'
      when v_event_type = 'STUDENT_EARLY_DEPARTURE'
        then student_name.name ||
          ' checked out early at ' ||
          to_char(
            NEW.occurred_at at time zone school.timezone,
            'HH24:MI'
          ) ||
          '.'
      else student_name.name ||
        ' checked out at ' ||
        to_char(
          NEW.occurred_at at time zone school.timezone,
          'HH24:MI'
        ) ||
        '.'
    end,
    null,
    null,
    jsonb_build_object(
      'schoolId', NEW.school_id::text,
      'studentId', NEW.student_id::text,
      'casaStudentId', student.casa_student_id,
      'studentName', student_name.name,
      'branchId', branch_context.branch_id,
      'branchName', branch_context.branch_name,
      'attendanceRecordId', NEW.attendance_record_id::text,
      'presenceEventId', NEW.id::text,
      'type', v_event_type,
      'eventType', v_event_type,
      'occurredAt', NEW.occurred_at::text,
      'reason', NEW.reason
    ),
    'PENDING',
    0,
    now(),
    now(),
    now()
  from students student
  join schools school
    on school.id = student.school_id
  cross join lateral (
    select concat_ws(
      ' ',
      student.first_name,
      nullif(student.middle_name, ''),
      student.last_name
    ) as name
  ) student_name
  left join lateral (
    select
      branch.id::text as branch_id,
      branch.name as branch_name
    from student_enrollments enrollment
    join school_branch_class_arms map
      on map.school_id = enrollment.school_id
     and map.class_arm_id = enrollment.class_arm_id
    join school_branches branch
      on branch.school_id = map.school_id
     and branch.id = map.branch_id
    where enrollment.school_id = student.school_id
      and enrollment.student_id = student.id
      and enrollment.starts_on <=
        (NEW.occurred_at at time zone school.timezone)::date
      and (
        enrollment.ends_on is null
        or enrollment.ends_on >=
          (NEW.occurred_at at time zone school.timezone)::date
      )
    order by
      enrollment.starts_on desc,
      enrollment.created_at desc
    limit 1
  ) branch_context on true
  join guardian_push_devices device
    on device.school_id = student.school_id
   and device.student_id = student.id
   and device.status = 'ACTIVE'
  join guardians guardian
    on guardian.school_id = device.school_id
   and guardian.id = device.guardian_id
   and guardian.status = 'ACTIVE'::guardian_status
  join student_guardians link
    on link.school_id = device.school_id
   and link.id = device.student_guardian_link_id
   and link.student_id = student.id
   and link.guardian_id = device.guardian_id
   and link.receives_notifications = true
  where student.school_id = NEW.school_id
    and student.id = NEW.student_id
  on conflict (
    school_id,
    presence_event_id,
    device_id
  )
  where presence_event_id is not null
  do update set
    event_type = excluded.event_type,
    title = excluded.title,
    body = excluded.body,
    icon_url = excluded.icon_url,
    click_url = excluded.click_url,
    payload = excluded.payload,
    updated_at = now();

  return NEW;
end;
$$;
-- CASA_STATEMENT_BREAK

update guardian_push_outbox outbox
set
  event_type =
    case
      when event.event_type::text = 'TEMPORARY_EXITED'
        then 'STUDENT_TEMPORARILY_OUT'
      else 'STUDENT_RETURNED_TO_CAMPUS'
    end,
  title =
    school.name || ' · CASA',
  body =
    case
      when event.event_type::text = 'TEMPORARY_EXITED'
        then concat_ws(
          ' ',
          student.first_name,
          nullif(student.middle_name, ''),
          student.last_name
        ) ||
        ' stepped out briefly from school at ' ||
        to_char(
          event.occurred_at at time zone school.timezone,
          'HH24:MI'
        ) ||
        ' and is expected back on campus soon. Reason: ' ||
        coalesce(
          nullif(
            trim(event.reason),
            ''
          ),
          'Not stated'
        ) ||
        '.'
      else concat_ws(
        ' ',
        student.first_name,
        nullif(student.middle_name, ''),
        student.last_name
      ) ||
      ' is now back on the school campus premises at ' ||
      to_char(
        event.occurred_at at time zone school.timezone,
        'HH24:MI'
      ) ||
      '.'
    end,
  payload =
    coalesce(
      outbox.payload,
      '{}'::jsonb
    ) ||
    jsonb_build_object(
      'type',
        case
          when event.event_type::text = 'TEMPORARY_EXITED'
            then 'STUDENT_TEMPORARILY_OUT'
          else 'STUDENT_RETURNED_TO_CAMPUS'
        end,
      'eventType',
        case
          when event.event_type::text = 'TEMPORARY_EXITED'
            then 'STUDENT_TEMPORARILY_OUT'
          else 'STUDENT_RETURNED_TO_CAMPUS'
        end,
      'studentName',
        concat_ws(
          ' ',
          student.first_name,
          nullif(student.middle_name, ''),
          student.last_name
        ),
      'presenceEventId',
        event.id::text,
      'occurredAt',
        event.occurred_at::text,
      'reason',
        event.reason
    ),
  updated_at = now()
from student_presence_events event
join schools school
  on school.id = event.school_id
join students student
  on student.school_id = event.school_id
 and student.id = event.student_id
where outbox.school_id = event.school_id
  and outbox.presence_event_id = event.id
  and event.event_type::text in (
    'TEMPORARY_EXITED',
    'TEMPORARY_RETURNED'
  )
  and outbox.device_displayed_at is null
  and outbox.status in (
    'PENDING',
    'RETRY',
    'FAILED',
    'SENT'
  );
