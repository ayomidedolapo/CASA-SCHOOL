-- CASA M51 Guardian Registration + Catch-up + PRESENCE_ONLY Supervised Presence
-- Adds durable browser registration credentials, truthful browser display receipts,
-- catch-up support, and preserves M50 multi-child device propagation semantics.

create table if not exists guardian_push_browser_registrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  guardian_id uuid not null references guardians(id) on delete cascade,
  enrollment_link_id uuid references guardian_push_enrollment_links(id) on delete set null,
  credential_hash varchar(64) not null unique,
  firebase_installation_id varchar(255) not null,
  status varchar(16) not null default 'ACTIVE',
  user_agent varchar(500),
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unregistered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_push_browser_registrations_hash_check
    check (credential_hash ~ '^[0-9a-f]{64}$'),
  constraint guardian_push_browser_registrations_fid_check
    check (length(trim(firebase_installation_id)) >= 10),
  constraint guardian_push_browser_registrations_status_check
    check (status in ('ACTIVE','STALE','REVOKED'))
);
-- CASA_STATEMENT_BREAK
create index if not exists guardian_push_browser_registrations_guardian_status_idx
  on guardian_push_browser_registrations (
    school_id,
    guardian_id,
    status,
    last_seen_at desc
  );
-- CASA_STATEMENT_BREAK
alter table guardian_push_devices
  add column if not exists browser_registration_id uuid
  references guardian_push_browser_registrations(id) on delete set null;
-- CASA_STATEMENT_BREAK
create index if not exists guardian_push_devices_browser_registration_idx
  on guardian_push_devices (
    browser_registration_id,
    status,
    last_seen_at desc
  );
-- CASA_STATEMENT_BREAK
alter table guardian_push_outbox
  add column if not exists delivery_receipt_token uuid
  default gen_random_uuid();
-- CASA_STATEMENT_BREAK
update guardian_push_outbox
set delivery_receipt_token = gen_random_uuid()
where delivery_receipt_token is null;
-- CASA_STATEMENT_BREAK
alter table guardian_push_outbox
  alter column delivery_receipt_token set not null;
-- CASA_STATEMENT_BREAK
alter table guardian_push_outbox
  add column if not exists device_displayed_at timestamptz;
-- CASA_STATEMENT_BREAK
create index if not exists guardian_push_outbox_display_receipt_idx
  on guardian_push_outbox (
    device_id,
    device_displayed_at,
    created_at desc
  );
-- CASA_STATEMENT_BREAK
create table if not exists guardian_push_delivery_receipts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  guardian_id uuid not null references guardians(id) on delete cascade,
  browser_registration_id uuid not null
    references guardian_push_browser_registrations(id) on delete cascade,
  presence_event_id uuid not null
    references student_presence_events(id) on delete cascade,
  display_source varchar(20) not null,
  displayed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint guardian_push_delivery_receipts_source_check
    check (display_source in ('BACKGROUND','FOREGROUND','CATCH_UP')),
  constraint guardian_push_delivery_receipts_registration_event_unique
    unique (browser_registration_id, presence_event_id)
);
-- CASA_STATEMENT_BREAK
create index if not exists guardian_push_delivery_receipts_guardian_idx
  on guardian_push_delivery_receipts (
    school_id,
    guardian_id,
    displayed_at desc
  );
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
    browser_registration_id,
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
    NEW.browser_registration_id,
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
  ) do update set
    branch_id = excluded.branch_id,
    enrollment_link_id = excluded.enrollment_link_id,
    browser_registration_id = excluded.browser_registration_id,
    status = 'ACTIVE',
    user_agent = excluded.user_agent,
    last_seen_at = excluded.last_seen_at,
    updated_at = now();

  return NEW;
end;
$$;
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
    browser_registration_id,
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
    source.browser_registration_id,
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
  ) do update set
    branch_id = excluded.branch_id,
    enrollment_link_id = excluded.enrollment_link_id,
    browser_registration_id = excluded.browser_registration_id,
    status = 'ACTIVE',
    user_agent = excluded.user_agent,
    last_seen_at = excluded.last_seen_at,
    updated_at = now();

  return NEW;
end;
$$;
