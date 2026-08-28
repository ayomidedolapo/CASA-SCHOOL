ALTER TYPE "school_membership_role" ADD VALUE 'SCHOOL_TECHNICIAN' BEFORE 'STAFF';--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "casa_student_id" varchar(32) DEFAULT 'CASA-STU-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)) NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ALTER COLUMN "admission_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_casa_student_id_unique" UNIQUE("casa_student_id");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_casa_student_id_format_check" CHECK ("casa_student_id" ~ '^CASA-STU-[0-9A-F]{16}$');--> statement-breakpoint
ALTER TABLE "students" DROP CONSTRAINT "students_admission_number_not_blank_check", ADD CONSTRAINT "students_admission_number_not_blank_check" CHECK ("admission_number" is null or length(trim("admission_number")) > 0);