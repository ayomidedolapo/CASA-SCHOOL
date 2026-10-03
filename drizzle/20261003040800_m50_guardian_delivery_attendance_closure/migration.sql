-- CASA M50 Guardian Delivery + Attendance Closure
-- Durable guardian-device propagation and DISABLED device semantics.
-- CASA_STATEMENT_BREAK
alter table guardian_push_devices
  drop constraint if exists guardian_push_devices_status_check;
-- CASA_STATEMENT_BREAK
alter table guardian_push_devices
  add constraint guardian_push_devices_status_check
  check (status in ('ACTIVE','DISABLED','REVOKED'));
-- CASA_STATEMENT_BREAK
create index if not exists guardian_push_devices_guardian_active_idx
  on guardian_push_devices (school_id, guardian_id, status, last_seen_at desc);
-- CASA_STATEMENT_BREAK
create or replace function casa_propagate_guardian_push_device_bindings()
returns trigger
language plpgsql
as $$
begin
  if NEW.status <> 'ACTIVE' or pg_trigger_depth() > 1 then
    return NEW;
  end if;

  insert into guardian_push_devices (
    school_id, branch_id, student_id, guardian_id,
    student_guardian_link_id, enrollment_link_id,
    firebase_installation_id, status, user_agent,
    last_seen_at, created_at, updated_at
  )
  select
    target.school_id,
    student.home_branch_id,
    target.student_id,
    target.guardian_id,
    target.id,
    NEW.enrollment_link_id,
    NEW.firebase_installation_id,
    'ACTIVE',
    NEW.user_agent,
    NEW.last_seen_at,
    now(),
    now()
  from student_guardians target
  join students student
    on student.school_id = target.school_id
   and student.id = target.student_id
  join guardians guardian
    on guardian.school_id = target.school_id
   and guardian.id = target.guardian_id
   and guardian.status = 'ACTIVE'::guardian_status
  where target.school_id = NEW.school_id
    and target.guardian_id = NEW.guardian_id
    and target.receives_notifications = true
  on conflict (
    school_id,
    student_guardian_link_id,
    firebase_installation_id
  ) do nothing;

  return NEW;
end;
$$;
-- CASA_STATEMENT_BREAK
drop trigger if exists guardian_push_device_binding_propagation_trigger
  on guardian_push_devices;
-- CASA_STATEMENT_BREAK
create trigger guardian_push_device_binding_propagation_trigger
after insert or update of status, firebase_installation_id
on guardian_push_devices
for each row
execute function casa_propagate_guardian_push_device_bindings();
-- CASA_STATEMENT_BREAK
create or replace function casa_bind_guardian_push_devices_on_notification_opt_in()
returns trigger
language plpgsql
as $$
begin
  if NEW.receives_notifications is distinct from true
     or pg_trigger_depth() > 1 then
    return NEW;
  end if;

  insert into guardian_push_devices (
    school_id, branch_id, student_id, guardian_id,
    student_guardian_link_id, enrollment_link_id,
    firebase_installation_id, status, user_agent,
    last_seen_at, created_at, updated_at
  )
  select distinct on (source.firebase_installation_id)
    NEW.school_id,
    student.home_branch_id,
    NEW.student_id,
    NEW.guardian_id,
    NEW.id,
    source.enrollment_link_id,
    source.firebase_installation_id,
    'ACTIVE',
    source.user_agent,
    source.last_seen_at,
    now(),
    now()
  from students student
  join guardian_push_devices source
    on source.school_id = NEW.school_id
   and source.guardian_id = NEW.guardian_id
   and source.status = 'ACTIVE'
  where student.school_id = NEW.school_id
    and student.id = NEW.student_id
  order by source.firebase_installation_id, source.last_seen_at desc
  on conflict (
    school_id,
    student_guardian_link_id,
    firebase_installation_id
  ) do nothing;

  return NEW;
end;
$$;
-- CASA_STATEMENT_BREAK
drop trigger if exists guardian_push_notification_opt_in_binding_trigger
  on student_guardians;
-- CASA_STATEMENT_BREAK
create trigger guardian_push_notification_opt_in_binding_trigger
after insert or update of receives_notifications
on student_guardians
for each row
execute function casa_bind_guardian_push_devices_on_notification_opt_in();
-- CASA_STATEMENT_BREAK
insert into guardian_push_devices (
  school_id, branch_id, student_id, guardian_id,
  student_guardian_link_id, enrollment_link_id,
  firebase_installation_id, status, user_agent,
  last_seen_at, created_at, updated_at
)
select distinct on (
  target.school_id,
  target.id,
  source.firebase_installation_id
)
  target.school_id,
  student.home_branch_id,
  target.student_id,
  target.guardian_id,
  target.id,
  source.enrollment_link_id,
  source.firebase_installation_id,
  'ACTIVE',
  source.user_agent,
  source.last_seen_at,
  now(),
  now()
from student_guardians target
join guardians guardian
  on guardian.school_id = target.school_id
 and guardian.id = target.guardian_id
 and guardian.status = 'ACTIVE'::guardian_status
join students student
  on student.school_id = target.school_id
 and student.id = target.student_id
join guardian_push_devices source
  on source.school_id = target.school_id
 and source.guardian_id = target.guardian_id
 and source.status = 'ACTIVE'
where target.receives_notifications = true
order by
  target.school_id,
  target.id,
  source.firebase_installation_id,
  source.last_seen_at desc
on conflict (
  school_id,
  student_guardian_link_id,
  firebase_installation_id
) do nothing;
