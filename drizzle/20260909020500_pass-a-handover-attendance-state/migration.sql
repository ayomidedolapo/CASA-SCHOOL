ALTER TABLE "student_identity_cards"
  ALTER COLUMN "status"
  SET DEFAULT 'READY_FOR_ACTIVATION'::"student_identity_card_status";
--> statement-breakpoint
CREATE UNIQUE INDEX "student_identity_cards_one_pending_activation_per_student_idx"
  ON "student_identity_cards" USING btree ("school_id", "student_id")
  WHERE "status" = 'READY_FOR_ACTIVATION'::"student_identity_card_status";
--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles"
  ADD COLUMN "scheduled_resume_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles"
  ADD COLUMN "scheduled_resume_by_membership_id" uuid;
--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles"
  ADD COLUMN "scheduled_resume_reason" varchar(240);
--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycle_events"
  ADD COLUMN "scheduled_for" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles"
  ADD CONSTRAINT "school_attendance_lifecycles_scheduled_resume_by_fk"
  FOREIGN KEY ("school_id", "scheduled_resume_by_membership_id")
  REFERENCES "public"."school_memberships"("school_id", "id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles"
  ADD CONSTRAINT "school_attendance_lifecycles_scheduled_resume_actor_check"
  CHECK (
    (
      "scheduled_resume_at" is null
      and "scheduled_resume_by_membership_id" is null
      and "scheduled_resume_reason" is null
    )
    or
    (
      "scheduled_resume_at" is not null
      and "scheduled_resume_by_membership_id" is not null
    )
  );
--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles"
  ADD CONSTRAINT "school_attendance_lifecycles_scheduled_resume_status_check"
  CHECK (
    "scheduled_resume_at" is null
    or "status" = 'PAUSED'::"school_attendance_lifecycle_status"
  );
--> statement-breakpoint
ALTER TABLE "school_attendance_lifecycles"
  ADD CONSTRAINT "school_attendance_lifecycles_scheduled_resume_reason_check"
  CHECK (
    "scheduled_resume_reason" is null
    or length(trim("scheduled_resume_reason")) > 0
  );
--> statement-breakpoint
ALTER TABLE "student_arrival_method_assignments"
  ALTER COLUMN "assigned_by_membership_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "student_arrival_method_assignments"
  ADD COLUMN "assigned_by_internal_membership_id" uuid;
--> statement-breakpoint
ALTER TABLE "student_arrival_method_assignments"
  ADD CONSTRAINT "student_arrival_method_assignments_internal_actor_fk"
  FOREIGN KEY ("assigned_by_internal_membership_id")
  REFERENCES "public"."casa_internal_memberships"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_arrival_method_assignments"
  ADD CONSTRAINT "student_arrival_method_assignments_actor_check"
  CHECK (
    not (
      "assigned_by_membership_id" is not null
      and "assigned_by_internal_membership_id" is not null
    )
  );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "public"."student_arrival_method_assignments_actor_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_fields_changed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor_fields_changed := true;
  ELSIF TG_OP = 'UPDATE' THEN
    actor_fields_changed :=
      NEW."assigned_by_membership_id" IS DISTINCT FROM OLD."assigned_by_membership_id"
      OR NEW."assigned_by_internal_membership_id" IS DISTINCT FROM OLD."assigned_by_internal_membership_id";
  END IF;

  IF actor_fields_changed THEN
    IF
      (
        NEW."assigned_by_membership_id" is null
        and NEW."assigned_by_internal_membership_id" is null
      )
      OR
      (
        NEW."assigned_by_membership_id" is not null
        and NEW."assigned_by_internal_membership_id" is not null
      )
    THEN
      RAISE EXCEPTION
        'student_arrival_method_assignments requires exactly one actor'
        USING
          ERRCODE = '23514',
          CONSTRAINT = 'student_arrival_method_assignments_actor_guard';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "student_arrival_method_assignments_actor_guard_trigger"
  BEFORE INSERT OR UPDATE
  ON "student_arrival_method_assignments"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."student_arrival_method_assignments_actor_guard"();
--> statement-breakpoint
CREATE TABLE "student_first_card_attendance_exceptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "pending_card_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "attendance_record_id" uuid NOT NULL,
  "verified_by_membership_id" uuid NOT NULL,
  "verification_method" "student_card_attendance_exception_verification" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "student_first_card_attendance_exceptions_school_id_id_unique"
    UNIQUE("school_id", "id"),
  CONSTRAINT "student_first_card_attendance_exceptions_student_session_unique"
    UNIQUE("school_id", "student_id", "session_id"),
  CONSTRAINT "student_first_card_attendance_exceptions_card_session_unique"
    UNIQUE("school_id", "pending_card_id", "session_id")
);
--> statement-breakpoint
ALTER TABLE "student_first_card_attendance_exceptions"
  ADD CONSTRAINT "student_first_card_attendance_exceptions_student_fk"
  FOREIGN KEY ("school_id", "student_id")
  REFERENCES "public"."students"("school_id", "id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_first_card_attendance_exceptions"
  ADD CONSTRAINT "student_first_card_attendance_exceptions_card_fk"
  FOREIGN KEY ("school_id", "pending_card_id")
  REFERENCES "public"."student_identity_cards"("school_id", "id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_first_card_attendance_exceptions"
  ADD CONSTRAINT "student_first_card_attendance_exceptions_session_fk"
  FOREIGN KEY ("school_id", "session_id")
  REFERENCES "public"."attendance_sessions"("school_id", "id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_first_card_attendance_exceptions"
  ADD CONSTRAINT "student_first_card_attendance_exceptions_record_fk"
  FOREIGN KEY ("school_id", "attendance_record_id")
  REFERENCES "public"."student_attendance_records"("school_id", "id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_first_card_attendance_exceptions"
  ADD CONSTRAINT "student_first_card_attendance_exceptions_verifier_fk"
  FOREIGN KEY ("school_id", "verified_by_membership_id")
  REFERENCES "public"."school_memberships"("school_id", "id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "student_first_card_attendance_exceptions_student_created_idx"
  ON "student_first_card_attendance_exceptions" USING btree
  ("school_id", "student_id", "created_at");
--> statement-breakpoint
CREATE TABLE "student_supervised_late_arrivals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "attendance_record_id" uuid NOT NULL,
  "verified_by_membership_id" uuid NOT NULL,
  "reason" varchar(240) NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "student_supervised_late_arrivals_school_id_id_unique"
    UNIQUE("school_id", "id"),
  CONSTRAINT "student_supervised_late_arrivals_student_session_unique"
    UNIQUE("school_id", "student_id", "session_id"),
  CONSTRAINT "student_supervised_late_arrivals_reason_not_blank_check"
    CHECK (length(trim("reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "student_supervised_late_arrivals"
  ADD CONSTRAINT "student_supervised_late_arrivals_branch_fk"
  FOREIGN KEY ("school_id", "branch_id")
  REFERENCES "public"."school_branches"("school_id", "id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_supervised_late_arrivals"
  ADD CONSTRAINT "student_supervised_late_arrivals_student_fk"
  FOREIGN KEY ("school_id", "student_id")
  REFERENCES "public"."students"("school_id", "id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_supervised_late_arrivals"
  ADD CONSTRAINT "student_supervised_late_arrivals_session_fk"
  FOREIGN KEY ("school_id", "session_id")
  REFERENCES "public"."attendance_sessions"("school_id", "id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_supervised_late_arrivals"
  ADD CONSTRAINT "student_supervised_late_arrivals_record_fk"
  FOREIGN KEY ("school_id", "attendance_record_id")
  REFERENCES "public"."student_attendance_records"("school_id", "id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "student_supervised_late_arrivals"
  ADD CONSTRAINT "student_supervised_late_arrivals_verifier_fk"
  FOREIGN KEY ("school_id", "verified_by_membership_id")
  REFERENCES "public"."school_memberships"("school_id", "id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "student_supervised_late_arrivals_branch_occurred_idx"
  ON "student_supervised_late_arrivals" USING btree
  ("school_id", "branch_id", "occurred_at");
