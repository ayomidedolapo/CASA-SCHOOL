-- CASA M57 Attendance Safety + Temporary Step-out/Return
-- Additive attendance safety closure. Existing attendance records are not rewritten.

alter type attendance_presence_event_type
  add value if not exists 'TEMPORARY_EXITED';
-- CASA_STATEMENT_BREAK
alter type attendance_presence_event_type
  add value if not exists 'TEMPORARY_RETURNED';
-- CASA_STATEMENT_BREAK
alter type school_notification_event_type
  add value if not exists 'STUDENT_TEMPORARILY_OUT';
-- CASA_STATEMENT_BREAK
alter type school_notification_event_type
  add value if not exists 'STUDENT_RETURNED_TO_CAMPUS';
-- CASA_STATEMENT_BREAK

alter table student_presence_events
  drop constraint if exists student_presence_events_record_type_unique;
-- CASA_STATEMENT_BREAK

create unique index if not exists student_presence_events_one_checkin_per_record_idx
  on student_presence_events (school_id, attendance_record_id)
  where event_type::text = 'CHECKED_IN';
-- CASA_STATEMENT_BREAK
create unique index if not exists student_presence_events_one_checkout_per_record_idx
  on student_presence_events (school_id, attendance_record_id)
  where event_type::text = 'CHECKED_OUT';
-- CASA_STATEMENT_BREAK

alter table student_presence_events
  drop constraint if exists student_presence_events_departure_semantics_check;
-- CASA_STATEMENT_BREAK
alter table student_presence_events
  add constraint student_presence_events_departure_semantics_check
  check (
    (event_type::text = 'CHECKED_IN' and departure_result::text = 'NOT_RUN')
    or
    (event_type::text = 'CHECKED_OUT' and departure_result::text <> 'NOT_RUN')
    or
    (
      event_type::text in ('TEMPORARY_EXITED','TEMPORARY_RETURNED')
      and departure_result::text = 'NOT_RUN'
    )
  );
-- CASA_STATEMENT_BREAK

create table if not exists student_temporary_exit_cycles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  branch_id uuid not null references school_branches(id) on delete cascade,
  session_id uuid not null references attendance_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  attendance_record_id uuid not null references student_attendance_records(id) on delete cascade,
  authorized_by_membership_id uuid not null references school_memberships(id),
  passkey_grant_id uuid not null references auth_passkey_step_up_grants(id),
  reason varchar(240) not null,
  status varchar(16) not null default 'AUTHORIZED',
  step_out_attempt_id uuid references attendance_verification_attempts(id),
  step_out_event_id uuid references student_presence_events(id),
  stepped_out_at timestamptz,
  return_attempt_id uuid references attendance_verification_attempts(id),
  return_event_id uuid references student_presence_events(id),
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_temporary_exit_cycles_reason_check
    check (length(trim(reason)) between 3 and 240),
  constraint student_temporary_exit_cycles_status_check
    check (status in ('AUTHORIZED','OUTSIDE','RETURNED','CANCELLED')),
  constraint student_temporary_exit_cycles_step_out_check
    check (
      (status = 'AUTHORIZED' and step_out_attempt_id is null and step_out_event_id is null and stepped_out_at is null)
      or
      (status in ('OUTSIDE','RETURNED') and step_out_attempt_id is not null and step_out_event_id is not null and stepped_out_at is not null)
      or
      status = 'CANCELLED'
    ),
  constraint student_temporary_exit_cycles_return_check
    check (
      status <> 'RETURNED'
      or (return_attempt_id is not null and return_event_id is not null and returned_at is not null)
    )
);
-- CASA_STATEMENT_BREAK
create unique index if not exists student_temporary_exit_cycles_one_open_idx
  on student_temporary_exit_cycles (school_id, session_id, student_id)
  where status in ('AUTHORIZED','OUTSIDE');
-- CASA_STATEMENT_BREAK
create index if not exists student_temporary_exit_cycles_school_status_idx
  on student_temporary_exit_cycles (school_id, branch_id, status, created_at desc);
