-- CASA M49: mid-session branch transfer persistence only.
create type "public"."student_branch_transfer_status"
as enum (
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED'
);
--> statement-breakpoint
create table "student_branch_transfer_requests" (
  "id" uuid primary key default gen_random_uuid() not null,
  "school_id" uuid not null,
  "student_id" uuid not null,
  "source_branch_id" uuid not null,
  "target_branch_id" uuid not null,
  "source_enrollment_id" uuid not null,
  "target_class_arm_id" uuid,
  "status" "student_branch_transfer_status" default 'PENDING' not null,
  "reason" text,
  "requested_by_membership_id" uuid not null,
  "decided_by_membership_id" uuid,
  "requested_at" timestamp with time zone default now() not null,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "student_branch_transfer_school_id_id_unique"
    unique("school_id","id"),
  constraint "student_branch_transfer_branches_differ_check"
    check ("source_branch_id" <> "target_branch_id"),
  constraint "student_branch_transfer_decision_pair_check"
    check (
      (
        "status" = 'PENDING'
        and "decided_at" is null
        and "decided_by_membership_id" is null
      )
      or
      (
        "status" <> 'PENDING'
        and "decided_at" is not null
        and "decided_by_membership_id" is not null
      )
    )
);
--> statement-breakpoint
alter table "student_branch_transfer_requests"
add constraint "student_branch_transfer_student_fk"
foreign key ("school_id","student_id")
references "public"."students"("school_id","id")
on delete cascade
on update no action;
--> statement-breakpoint
alter table "student_branch_transfer_requests"
add constraint "student_branch_transfer_source_branch_fk"
foreign key ("school_id","source_branch_id")
references "public"."school_branches"("school_id","id")
on delete restrict
on update no action;
--> statement-breakpoint
alter table "student_branch_transfer_requests"
add constraint "student_branch_transfer_target_branch_fk"
foreign key ("school_id","target_branch_id")
references "public"."school_branches"("school_id","id")
on delete restrict
on update no action;
--> statement-breakpoint
alter table "student_branch_transfer_requests"
add constraint "student_branch_transfer_source_enrollment_fk"
foreign key ("school_id","source_enrollment_id")
references "public"."student_enrollments"("school_id","id")
on delete restrict
on update no action;
--> statement-breakpoint
alter table "student_branch_transfer_requests"
add constraint "student_branch_transfer_target_class_fk"
foreign key ("school_id","target_class_arm_id")
references "public"."class_arms"("school_id","id")
on delete restrict
on update no action;
--> statement-breakpoint
alter table "student_branch_transfer_requests"
add constraint "student_branch_transfer_requester_fk"
foreign key ("school_id","requested_by_membership_id")
references "public"."school_memberships"("school_id","id")
on delete restrict
on update no action;
--> statement-breakpoint
alter table "student_branch_transfer_requests"
add constraint "student_branch_transfer_decider_fk"
foreign key ("school_id","decided_by_membership_id")
references "public"."school_memberships"("school_id","id")
on delete restrict
on update no action;
--> statement-breakpoint
create unique index "student_branch_transfer_one_pending_idx"
on "student_branch_transfer_requests" using btree (
  "school_id",
  "student_id"
)
where "status" = 'PENDING';
--> statement-breakpoint
create index "student_branch_transfer_source_status_idx"
on "student_branch_transfer_requests" using btree (
  "school_id",
  "source_branch_id",
  "status"
);
--> statement-breakpoint
create index "student_branch_transfer_target_status_idx"
on "student_branch_transfer_requests" using btree (
  "school_id",
  "target_branch_id",
  "status"
);
