-- CASA M39 Operational UX Closure
-- Additive attendance lifecycle + presence-only semantics + terminal health state.

alter table attendance_branch_sessions
  add column if not exists mode varchar(24) not null default 'INSTRUCTIONAL';

alter table attendance_branch_sessions
  alter column status set default 'PLANNED',
  alter column opened_at drop not null,
  alter column opened_at drop default;

alter table attendance_branch_sessions
  drop constraint if exists attendance_branch_sessions_status_check,
  drop constraint if exists attendance_branch_sessions_closed_state_check,
  drop constraint if exists attendance_branch_sessions_mode_check;

alter table attendance_branch_sessions
  add constraint attendance_branch_sessions_status_check
    check (status in ('PLANNED','OPEN','CLOSED','CANCELLED')),
  add constraint attendance_branch_sessions_mode_check
    check (mode in ('INSTRUCTIONAL','PRESENCE_ONLY')),
  add constraint attendance_branch_sessions_closed_state_check
    check (
      (status = 'PLANNED' and opened_at is null and closed_at is null)
      or (status = 'OPEN' and opened_at is not null and closed_at is null)
      or (status = 'CLOSED' and opened_at is not null and closed_at is not null)
      or status = 'CANCELLED'
    );

alter table student_attendance_records
  add column if not exists count_for_attendance boolean not null default true;

create table if not exists attendance_terminal_health_states (
  terminal_id uuid primary key,
  school_id uuid not null,
  branch_id uuid,
  observed_status varchar(16) not null,
  last_transition_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_terminal_health_states_status_check
    check (observed_status in ('ONLINE','OFFLINE')),
  constraint attendance_terminal_health_states_school_terminal_fk
    foreign key (school_id, terminal_id)
    references attendance_terminals(school_id, id)
    on delete cascade,
  constraint attendance_terminal_health_states_school_branch_fk
    foreign key (school_id, branch_id)
    references school_branches(school_id, id)
    on delete cascade
);

create index if not exists attendance_terminal_health_states_school_status_idx
  on attendance_terminal_health_states(school_id, observed_status, updated_at desc);
