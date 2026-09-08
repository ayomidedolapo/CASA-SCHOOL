ALTER TABLE "student_card_templates"
  ADD COLUMN "school_id" uuid;
--> statement-breakpoint

WITH template_school AS (
  SELECT
    template_id,
    min(school_id::text)::uuid AS school_id
  FROM student_card_production_jobs
  GROUP BY template_id
  HAVING count(DISTINCT school_id) = 1
)
UPDATE student_card_templates t
SET school_id = template_school.school_id
FROM template_school
WHERE template_school.template_id = t.id
  AND t.school_id IS NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM student_card_templates
    WHERE school_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'CASA cannot infer school_id for one or more existing student card templates.';
  END IF;
END
$$;
--> statement-breakpoint

ALTER TABLE "student_card_templates"
  ALTER COLUMN "school_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "student_card_templates"
  ADD CONSTRAINT "student_card_templates_school_id_schools_id_fk"
  FOREIGN KEY ("school_id")
  REFERENCES "public"."schools"("id")
  ON DELETE no action
  ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "student_card_templates"
  DROP CONSTRAINT IF EXISTS "student_card_templates_version_unique";
--> statement-breakpoint

DROP INDEX IF EXISTS "student_card_templates_one_active_idx";
--> statement-breakpoint

ALTER TABLE "student_card_templates"
  ADD CONSTRAINT "student_card_templates_school_version_unique"
  UNIQUE ("school_id", "version_label");
--> statement-breakpoint

CREATE UNIQUE INDEX
  "student_card_templates_one_active_per_school_idx"
ON "student_card_templates"
  USING btree ("school_id")
WHERE "student_card_templates"."status" = 'ACTIVE';
