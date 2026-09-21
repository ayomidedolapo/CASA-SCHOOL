ALTER TABLE "students"
  ALTER COLUMN "admission_date"
  DROP NOT NULL;

ALTER TABLE "students"
  DROP CONSTRAINT IF EXISTS "students_exit_after_admission_check";

ALTER TABLE "students"
  ADD CONSTRAINT "students_exit_after_admission_check"
  CHECK (
    "admission_date" IS NULL
    OR "exit_date" IS NULL
    OR "exit_date" >= "admission_date"
  );
