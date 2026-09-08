CREATE TABLE "school_teacher_class_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"academic_session_id" uuid NOT NULL,
	"class_arm_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_membership_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_teacher_class_assignments_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_teacher_class_assignments_teacher_session_class_unique" UNIQUE("school_id","membership_id","academic_session_id","class_arm_id")
);
--> statement-breakpoint
CREATE INDEX "school_teacher_class_assignments_teacher_active_idx" ON "school_teacher_class_assignments" ("school_id","membership_id","is_active","academic_session_id");--> statement-breakpoint
CREATE INDEX "school_teacher_class_assignments_class_active_idx" ON "school_teacher_class_assignments" ("school_id","class_arm_id","is_active","academic_session_id");--> statement-breakpoint
ALTER TABLE "school_teacher_class_assignments" ADD CONSTRAINT "school_teacher_class_assignments_membership_fk" FOREIGN KEY ("school_id","membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "school_teacher_class_assignments" ADD CONSTRAINT "school_teacher_class_assignments_session_fk" FOREIGN KEY ("school_id","academic_session_id") REFERENCES "academic_sessions"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "school_teacher_class_assignments" ADD CONSTRAINT "school_teacher_class_assignments_class_arm_fk" FOREIGN KEY ("school_id","class_arm_id") REFERENCES "class_arms"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "school_teacher_class_assignments" ADD CONSTRAINT "school_teacher_class_assignments_assigned_by_fk" FOREIGN KEY ("school_id","assigned_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "school_teacher_class_assignments" ADD CONSTRAINT "school_teacher_class_assignments_revoked_by_fk" FOREIGN KEY ("school_id","revoked_by_membership_id") REFERENCES "school_memberships"("school_id","id") ON DELETE RESTRICT;