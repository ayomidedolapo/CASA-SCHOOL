CREATE TABLE "school_branch_notification_branding" (
	"branch_id" uuid PRIMARY KEY,
	"school_id" uuid NOT NULL,
	"logo_object_key" varchar(500),
	"logo_content_type" varchar(100),
	"updated_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_branch_notification_branding_logo_pair_check" CHECK (("logo_object_key" is null and "logo_content_type" is null) or ("logo_object_key" is not null and "logo_content_type" is not null))
);
--> statement-breakpoint
CREATE TABLE "school_branch_staff_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_branch_staff_assignments_unique" UNIQUE("school_id","branch_id","membership_id")
);
--> statement-breakpoint
CREATE INDEX "school_branch_notification_branding_school_idx" ON "school_branch_notification_branding" ("school_id");
--> statement-breakpoint
CREATE INDEX "school_branch_staff_membership_idx" ON "school_branch_staff_assignments" ("school_id","membership_id","is_active");
--> statement-breakpoint
CREATE INDEX "school_branch_staff_branch_idx" ON "school_branch_staff_assignments" ("school_id","branch_id","is_active");
--> statement-breakpoint
ALTER TABLE "school_branch_notification_branding" ADD CONSTRAINT "school_branch_notification_branding_branch_fk" FOREIGN KEY ("school_id","branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "school_branch_notification_branding" ADD CONSTRAINT "school_branch_notification_branding_updater_fk" FOREIGN KEY ("school_id","updated_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "school_branch_staff_assignments" ADD CONSTRAINT "school_branch_staff_branch_fk" FOREIGN KEY ("school_id","branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "school_branch_staff_assignments" ADD CONSTRAINT "school_branch_staff_membership_fk" FOREIGN KEY ("school_id","membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "school_branch_staff_assignments" ADD CONSTRAINT "school_branch_staff_assigner_fk" FOREIGN KEY ("school_id","assigned_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE SET NULL;

with
raw_insert_values ("id", "school_id", "branch_id", "membership_id", "is_active", "assigned_by_membership_id", "created_at", "updated_at") as (
  select distinct
  gen_random_uuid(),
  role.school_id,
  branch.id,
  role.membership_id,
  true,
  null::uuid,
  now(),
  now()
from school_membership_roles role
join lateral (
  select b.id
  from school_branches b
  where b.school_id = role.school_id
    and b.status = 'ACTIVE'::school_branch_status
  order by b.is_headquarters desc, b.created_at asc
) branch on true
where role.role in (
  'STAFF'::school_membership_role,
  'SCHOOL_TECHNICIAN'::school_membership_role
)
and (
  select count(*)
  from school_branches count_branch
  where count_branch.school_id = role.school_id
    and count_branch.status = 'ACTIVE'::school_branch_status
) = 1
),
candidate as (
  select distinct on ("school_id", "branch_id", "membership_id")
    *
  from raw_insert_values
  order by "school_id", "branch_id", "membership_id"
)
update school_branch_staff_assignments existing
set is_active = true,
  updated_at = now()
from candidate
where existing."school_id" = candidate."school_id"
  and existing."branch_id" = candidate."branch_id"
  and existing."membership_id" = candidate."membership_id";

with
raw_insert_values ("id", "school_id", "branch_id", "membership_id", "is_active", "assigned_by_membership_id", "created_at", "updated_at") as (
  select distinct
  gen_random_uuid(),
  role.school_id,
  branch.id,
  role.membership_id,
  true,
  null::uuid,
  now(),
  now()
from school_membership_roles role
join lateral (
  select b.id
  from school_branches b
  where b.school_id = role.school_id
    and b.status = 'ACTIVE'::school_branch_status
  order by b.is_headquarters desc, b.created_at asc
) branch on true
where role.role in (
  'STAFF'::school_membership_role,
  'SCHOOL_TECHNICIAN'::school_membership_role
)
and (
  select count(*)
  from school_branches count_branch
  where count_branch.school_id = role.school_id
    and count_branch.status = 'ACTIVE'::school_branch_status
) = 1
),
candidate as (
  select distinct on ("school_id", "branch_id", "membership_id")
    *
  from raw_insert_values
  order by "school_id", "branch_id", "membership_id"
)
insert into school_branch_staff_assignments (
  "id",
  "school_id",
  "branch_id",
  "membership_id",
  "is_active",
  "assigned_by_membership_id",
  "created_at",
  "updated_at"
)
select
  candidate."id",
  candidate."school_id",
  candidate."branch_id",
  candidate."membership_id",
  candidate."is_active",
  candidate."assigned_by_membership_id",
  candidate."created_at",
  candidate."updated_at"
from candidate
on conflict ("school_id", "branch_id", "membership_id") do nothing;

with
raw_insert_values ("id", "school_id", "branch_id", "membership_id", "is_active", "assigned_by_membership_id", "created_at", "updated_at") as (
  select distinct
  gen_random_uuid(),
  role.school_id,
  branch_arm.branch_id,
  role.membership_id,
  true,
  null::uuid,
  now(),
  now()
from school_membership_roles role
join school_teacher_class_assignments teacher
  on teacher.school_id = role.school_id
 and teacher.membership_id = role.membership_id
 and teacher.is_active = true
join school_branch_class_arms branch_arm
  on branch_arm.school_id = teacher.school_id
 and branch_arm.class_arm_id = teacher.class_arm_id
where role.role = 'STAFF'::school_membership_role
),
candidate as (
  select distinct on ("school_id", "branch_id", "membership_id")
    *
  from raw_insert_values
  order by "school_id", "branch_id", "membership_id"
)
update school_branch_staff_assignments existing
set is_active = true,
  updated_at = now()
from candidate
where existing."school_id" = candidate."school_id"
  and existing."branch_id" = candidate."branch_id"
  and existing."membership_id" = candidate."membership_id";

with
raw_insert_values ("id", "school_id", "branch_id", "membership_id", "is_active", "assigned_by_membership_id", "created_at", "updated_at") as (
  select distinct
  gen_random_uuid(),
  role.school_id,
  branch_arm.branch_id,
  role.membership_id,
  true,
  null::uuid,
  now(),
  now()
from school_membership_roles role
join school_teacher_class_assignments teacher
  on teacher.school_id = role.school_id
 and teacher.membership_id = role.membership_id
 and teacher.is_active = true
join school_branch_class_arms branch_arm
  on branch_arm.school_id = teacher.school_id
 and branch_arm.class_arm_id = teacher.class_arm_id
where role.role = 'STAFF'::school_membership_role
),
candidate as (
  select distinct on ("school_id", "branch_id", "membership_id")
    *
  from raw_insert_values
  order by "school_id", "branch_id", "membership_id"
)
insert into school_branch_staff_assignments (
  "id",
  "school_id",
  "branch_id",
  "membership_id",
  "is_active",
  "assigned_by_membership_id",
  "created_at",
  "updated_at"
)
select
  candidate."id",
  candidate."school_id",
  candidate."branch_id",
  candidate."membership_id",
  candidate."is_active",
  candidate."assigned_by_membership_id",
  candidate."created_at",
  candidate."updated_at"
from candidate
on conflict ("school_id", "branch_id", "membership_id") do nothing;