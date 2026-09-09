ALTER TYPE "public"."student_identity_card_status"
  ADD VALUE IF NOT EXISTS 'READY_FOR_ACTIVATION' BEFORE 'ACTIVE';
--> statement-breakpoint
ALTER TYPE "public"."student_identity_card_event_type"
  ADD VALUE IF NOT EXISTS 'ACTIVATED' AFTER 'ISSUED';
--> statement-breakpoint
ALTER TYPE "public"."school_attendance_lifecycle_event_type"
  ADD VALUE IF NOT EXISTS 'RESUME_SCHEDULED' BEFORE 'RESUMED';
--> statement-breakpoint
ALTER TYPE "public"."school_attendance_lifecycle_event_type"
  ADD VALUE IF NOT EXISTS 'RESUME_SCHEDULE_CANCELLED' BEFORE 'RESUMED';
