ALTER TABLE "students"
ADD COLUMN IF NOT EXISTS "home_branch_id" uuid;
--> statement-breakpoint

WITH active_enrollment_branch AS (
  SELECT DISTINCT ON (
    enrollment.school_id,
    enrollment.student_id
  )
    enrollment.school_id,
    enrollment.student_id,
    branch_arm.branch_id
  FROM "student_enrollments" enrollment
  JOIN "school_branch_class_arms" branch_arm
    ON branch_arm.school_id = enrollment.school_id
   AND branch_arm.class_arm_id = enrollment.class_arm_id
  JOIN "school_branches" branch
    ON branch.school_id = branch_arm.school_id
   AND branch.id = branch_arm.branch_id
  WHERE enrollment.status = 'ACTIVE'::student_enrollment_status
    AND branch.status = 'ACTIVE'::school_branch_status
  ORDER BY
    enrollment.school_id,
    enrollment.student_id,
    enrollment.updated_at DESC,
    enrollment.created_at DESC
)
UPDATE "students" student
SET
  "home_branch_id" = source.branch_id,
  "updated_at" = now()
FROM active_enrollment_branch source
WHERE student.school_id = source.school_id
  AND student.id = source.student_id
  AND student.home_branch_id IS NULL;
--> statement-breakpoint

WITH single_active_branch AS (
  SELECT
    school_id,
    min(id::text)::uuid AS branch_id
  FROM "school_branches"
  WHERE status = 'ACTIVE'::school_branch_status
  GROUP BY school_id
  HAVING count(*) = 1
)
UPDATE "students" student
SET
  "home_branch_id" = source.branch_id,
  "updated_at" = now()
FROM single_active_branch source
WHERE student.school_id = source.school_id
  AND student.home_branch_id IS NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'students_school_home_branch_fk'
  ) THEN
    ALTER TABLE "students"
    ADD CONSTRAINT "students_school_home_branch_fk"
    FOREIGN KEY (
      "school_id",
      "home_branch_id"
    )
    REFERENCES "school_branches" (
      "school_id",
      "id"
    )
    ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS
"students_school_home_branch_status_idx"
ON "students" (
  "school_id",
  "home_branch_id",
  "status"
);
