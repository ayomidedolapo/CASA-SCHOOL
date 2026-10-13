-- CASA M76 Guardian Closure + Late-Stay Truth
-- Additive guardian operational notification support.
-- Branch attendance, presence, continuity, and existing notification history are preserved.

alter table guardian_push_outbox
  add column if not exists operational_event_key varchar(240);
-- CASA_STATEMENT_BREAK

alter table guardian_push_outbox
  drop constraint if exists guardian_push_outbox_operational_event_key_check,
  add constraint guardian_push_outbox_operational_event_key_check
  check (
    operational_event_key is null
    or length(trim(operational_event_key)) > 0
  );
-- CASA_STATEMENT_BREAK

create unique index if not exists guardian_push_outbox_operational_event_device_unique
  on guardian_push_outbox (
    school_id,
    operational_event_key,
    guardian_id,
    firebase_installation_id
  )
  where operational_event_key is not null;
-- CASA_STATEMENT_BREAK

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
      'SCHOOL_CALENDAR_NOTICE',
      'SCHOOL_DAY_CLOSED',
      'STUDENT_LATE_STAY_AUTHORIZED'
    )
  );
