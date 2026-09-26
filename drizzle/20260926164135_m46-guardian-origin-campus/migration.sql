ALTER TABLE "guardians" ADD COLUMN "origin_branch_id" uuid;--> statement-breakpoint
CREATE INDEX "guardians_school_origin_branch_status_idx" ON "guardians" ("school_id","origin_branch_id","status");--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_origin_branch_fk" FOREIGN KEY ("school_id","origin_branch_id") REFERENCES "school_branches"("school_id","id") ON DELETE RESTRICT;
--> statement-breakpoint
update "guardians" as guardian
set "origin_branch_id" = headquarters."id"
from "school_branches" as headquarters
where headquarters."school_id" = guardian."school_id"
  and headquarters."is_headquarters" = true
  and guardian."origin_branch_id" is null;
--> statement-breakpoint
alter table "guardians"
alter column "origin_branch_id" set not null;