-- CASA M34A
-- Guardian FCM web-push registration + school notification branding.
-- Additive only. Does not delete legacy SMS/WhatsApp history.

create table if not exists school_notification_branding (
  school_id uuid primary key references schools(id) on delete cascade,
  logo_object_key varchar(500),
  logo_content_type varchar(100),
  updated_by_membership_id uuid references school_memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_notification_branding_logo_pair_check check (
    (logo_object_key is null and logo_content_type is null)
    or
    (logo_object_key is not null and logo_content_type is not null)
  )
);

create table if not exists guardian_push_enrollment_links (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  branch_id uuid references school_branches(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  guardian_id uuid not null references guardians(id) on delete cascade,
  student_guardian_link_id uuid not null references student_guardians(id) on delete cascade,
  token_hash varchar(64) not null unique,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_by_membership_id uuid not null references school_memberships(id),
  created_at timestamptz not null default now(),
  constraint guardian_push_enrollment_links_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint guardian_push_enrollment_links_state_check
    check (not (claimed_at is not null and revoked_at is not null))
);

create unique index if not exists guardian_push_enrollment_links_one_open_idx
  on guardian_push_enrollment_links (school_id, student_guardian_link_id)
  where claimed_at is null and revoked_at is null;

create table if not exists guardian_push_devices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  branch_id uuid references school_branches(id) on delete set null,
  student_id uuid not null references students(id) on delete cascade,
  guardian_id uuid not null references guardians(id) on delete cascade,
  student_guardian_link_id uuid not null references student_guardians(id) on delete cascade,
  enrollment_link_id uuid not null references guardian_push_enrollment_links(id) on delete cascade,
  firebase_installation_id varchar(255) not null,
  status varchar(16) not null default 'ACTIVE',
  user_agent varchar(500),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_push_devices_status_check
    check (status in ('ACTIVE','REVOKED')),
  constraint guardian_push_devices_fid_check
    check (length(trim(firebase_installation_id)) >= 10)
);

create unique index if not exists guardian_push_devices_relationship_fid_unique
  on guardian_push_devices (
    school_id,
    student_guardian_link_id,
    firebase_installation_id
  );

create index if not exists guardian_push_devices_student_active_idx
  on guardian_push_devices (school_id, student_id, status);

create table if not exists guardian_push_outbox (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  guardian_id uuid not null references guardians(id) on delete cascade,
  device_id uuid not null references guardian_push_devices(id) on delete cascade,
  attendance_record_id uuid,
  presence_event_id uuid,
  firebase_installation_id varchar(255) not null,
  event_type varchar(40) not null,
  title varchar(220) not null,
  body varchar(500) not null,
  icon_url varchar(1000),
  click_url varchar(1000),
  payload jsonb not null default '{}'::jsonb,
  status varchar(20) not null default 'PENDING',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  sent_at timestamptz,
  provider_message_id varchar(500),
  last_error varchar(1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_push_outbox_status_check
    check (status in ('PENDING','PROCESSING','RETRY','SENT','FAILED','CANCELLED')),
  constraint guardian_push_outbox_event_type_check
    check (event_type in ('STUDENT_CHECKED_IN','STUDENT_SIGNED_OUT','STUDENT_EARLY_DEPARTURE')),
  constraint guardian_push_outbox_attempt_check check (attempt_count >= 0)
);

create unique index if not exists guardian_push_outbox_presence_device_unique
  on guardian_push_outbox (school_id, presence_event_id, device_id)
  where presence_event_id is not null;

create index if not exists guardian_push_outbox_due_idx
  on guardian_push_outbox (status, available_at, created_at)
  where status in ('PENDING','RETRY');
