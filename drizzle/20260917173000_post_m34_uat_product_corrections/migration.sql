-- CASA M36: post-M34 UAT product corrections.
-- Additive durable Summer Programme model + guardian push event vocabulary.
-- No terminal is required for Summer attendance.

create table if not exists summer_programmes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  branch_id uuid not null references school_branches(id) on delete cascade,
  name varchar(120) not null,
  starts_on date not null,
  ends_on date not null,
  operating_days smallint[] not null default array[1,2,3,4,5]::smallint[],
  check_in_opens time not null,
  expected_arrival time not null,
  check_in_closes time not null,
  dismissal_time time not null,
  checkout_closes time not null,
  status varchar(20) not null default 'PLANNED',
  created_by_membership_id uuid references school_memberships(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint summer_programmes_dates_check check (starts_on <= ends_on),
  constraint summer_programmes_times_check check (
    check_in_opens <= expected_arrival and
    expected_arrival <= check_in_closes and
    check_in_closes < dismissal_time and
    dismissal_time <= checkout_closes
  ),
  constraint summer_programmes_status_check check (status in ('PLANNED','ACTIVE','CLOSED')),
  constraint summer_programmes_days_check check (
    cardinality(operating_days) between 1 and 7 and
    operating_days <@ array[0,1,2,3,4,5,6]::smallint[]
  )
);

create index if not exists summer_programmes_school_branch_dates_idx
  on summer_programmes (school_id, branch_id, starts_on, ends_on);

create table if not exists summer_programme_teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  programme_id uuid not null references summer_programmes(id) on delete cascade,
  membership_id uuid not null references school_memberships(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (programme_id, membership_id)
);

create table if not exists summer_participants (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  programme_id uuid not null references summer_programmes(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  guest_full_name varchar(180),
  guest_sex varchar(20),
  guest_guardian_name varchar(180),
  guest_guardian_phone varchar(40),
  guest_guardian_email varchar(320),
  guest_notifications_enabled boolean not null default true,
  status varchar(20) not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint summer_participants_identity_check check (
    (student_id is not null and guest_full_name is null)
    or
    (student_id is null and length(trim(coalesce(guest_full_name,''))) > 0)
  ),
  constraint summer_participants_status_check check (status in ('ACTIVE','WITHDRAWN'))
);

create unique index if not exists summer_participants_existing_student_unique
  on summer_participants (programme_id, student_id)
  where student_id is not null and status = 'ACTIVE';

create table if not exists summer_attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  programme_id uuid not null references summer_programmes(id) on delete cascade,
  participant_id uuid not null references summer_participants(id) on delete cascade,
  attendance_date date not null,
  status varchar(20) not null,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  marked_by_membership_id uuid references school_memberships(id) on delete set null,
  note varchar(500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (programme_id, participant_id, attendance_date),
  constraint summer_attendance_status_check check (status in ('PRESENT','LATE','ABSENT')),
  constraint summer_attendance_checkout_check check (checked_out_at is null or checked_in_at is not null)
);

create index if not exists summer_attendance_programme_date_idx
  on summer_attendance (programme_id, attendance_date, status);

-- Summer uses the existing guardian FCM worker for enrolled CASA students.
-- Guests remain lightweight Summer participants; their guardian contact is retained
-- for the Summer notification enrollment surface without creating academic enrollment.
alter table guardian_push_outbox drop constraint if exists guardian_push_outbox_event_type_check;
alter table guardian_push_outbox add constraint guardian_push_outbox_event_type_check
  check (event_type in (
    'STUDENT_CHECKED_IN','STUDENT_SIGNED_OUT','STUDENT_EARLY_DEPARTURE',
    'SUMMER_PRESENT','SUMMER_LATE','SUMMER_SIGNED_OUT'
  ));
