-- CASA School M34B operational closure
-- Additive campus-scoped attendance control, selected-student late stay,
-- and durable operational notification inbox. Historical attendance rows
-- remain attached to the existing school/day attendance_sessions container.

ALTER TABLE "attendance_policies"
  ADD COLUMN IF NOT EXISTS "branch_id" uuid;

UPDATE "attendance_policies" p
SET "branch_id" = hq.id
FROM "school_branches" hq
WHERE hq.school_id = p.school_id
  AND hq.is_headquarters = true
  AND p.branch_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM attendance_policies
    WHERE branch_id IS NULL
  ) THEN
    RAISE EXCEPTION 'M34B cannot resolve branch_id for every attendance policy';
  END IF;
END $$;

ALTER TABLE "attendance_policies"
  ALTER COLUMN "branch_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_policies_school_branch_fk'
  ) THEN
    ALTER TABLE "attendance_policies"
      ADD CONSTRAINT "attendance_policies_school_branch_fk"
      FOREIGN KEY ("school_id", "branch_id")
      REFERENCES "school_branches"("school_id", "id")
      ON DELETE RESTRICT;
  END IF;
END $$;

DROP INDEX IF EXISTS "attendance_policies_one_default_active_per_school_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_policies_one_default_active_per_branch_idx"
  ON "attendance_policies" ("school_id", "branch_id")
  WHERE "is_default" = true AND "is_active" = true;
CREATE INDEX IF NOT EXISTS "attendance_policies_school_branch_active_idx"
  ON "attendance_policies" ("school_id", "branch_id", "is_active", "valid_from", "valid_to");

CREATE TABLE IF NOT EXISTS "attendance_branch_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "policy_id" uuid NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'OPEN',
  "opened_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz,
  "opened_by_membership_id" uuid,
  "closed_by_membership_id" uuid,
  "reopened_by_membership_id" uuid,
  "policy_rebound_by_membership_id" uuid,
  "policy_rebind_passkey_grant_id" uuid,
  "last_reason" varchar(240),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "attendance_branch_sessions_school_id_id_unique" UNIQUE ("school_id", "id"),
  CONSTRAINT "attendance_branch_sessions_school_session_branch_unique" UNIQUE ("school_id", "session_id", "branch_id"),
  CONSTRAINT "attendance_branch_sessions_status_check" CHECK ("status" IN ('OPEN','CLOSED','CANCELLED')),
  CONSTRAINT "attendance_branch_sessions_closed_state_check" CHECK (
    ("status" = 'OPEN' AND "closed_at" IS NULL)
    OR ("status" = 'CLOSED' AND "closed_at" IS NOT NULL)
    OR ("status" = 'CANCELLED')
  ),
  CONSTRAINT "attendance_branch_sessions_reason_check" CHECK ("last_reason" IS NULL OR length(trim("last_reason")) > 0),
  CONSTRAINT "attendance_branch_sessions_school_branch_fk" FOREIGN KEY ("school_id", "branch_id")
    REFERENCES "school_branches"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_branch_sessions_school_session_fk" FOREIGN KEY ("school_id", "session_id")
    REFERENCES "attendance_sessions"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "attendance_branch_sessions_school_policy_fk" FOREIGN KEY ("school_id", "policy_id")
    REFERENCES "attendance_policies"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_branch_sessions_opened_by_fk" FOREIGN KEY ("school_id", "opened_by_membership_id")
    REFERENCES "school_memberships"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_branch_sessions_closed_by_fk" FOREIGN KEY ("school_id", "closed_by_membership_id")
    REFERENCES "school_memberships"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_branch_sessions_reopened_by_fk" FOREIGN KEY ("school_id", "reopened_by_membership_id")
    REFERENCES "school_memberships"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_branch_sessions_rebound_by_fk" FOREIGN KEY ("school_id", "policy_rebound_by_membership_id")
    REFERENCES "school_memberships"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_branch_sessions_rebind_grant_fk" FOREIGN KEY ("policy_rebind_passkey_grant_id")
    REFERENCES "auth_passkey_step_up_grants"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "attendance_branch_sessions_branch_status_idx"
  ON "attendance_branch_sessions" ("school_id", "branch_id", "status", "updated_at" DESC);

-- Preserve the pre-M34B attendance day as an HQ campus session. This is a
-- historical compatibility backfill only; new branch sessions bind themselves.
INSERT INTO "attendance_branch_sessions" (
  "school_id", "session_id", "branch_id", "policy_id", "status",
  "opened_at", "closed_at", "created_at", "updated_at"
)
SELECT
  s.school_id,
  s.id,
  hq.id,
  s.policy_id,
  CASE
    WHEN s.status::text = 'CLOSED' THEN 'CLOSED'
    WHEN s.status::text = 'CANCELLED' THEN 'CANCELLED'
    ELSE 'OPEN'
  END,
  COALESCE(s.opened_at, s.created_at),
  CASE WHEN s.status::text = 'CLOSED' THEN COALESCE(s.closed_at, s.updated_at) ELSE NULL END,
  s.created_at,
  s.updated_at
FROM attendance_sessions s
JOIN school_branches hq
  ON hq.school_id = s.school_id
 AND hq.is_headquarters = true
ON CONFLICT (school_id, session_id, branch_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS "attendance_late_stay_authorizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid NOT NULL,
  "session_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "attendance_record_id" uuid NOT NULL,
  "authorized_by_membership_id" uuid NOT NULL,
  "passkey_grant_id" uuid NOT NULL,
  "reason" varchar(240) NOT NULL,
  "allowed_until" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "consumed_at" timestamptz,
  "consumed_attempt_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "attendance_late_stay_school_id_id_unique" UNIQUE ("school_id", "id"),
  CONSTRAINT "attendance_late_stay_reason_check" CHECK (length(trim("reason")) > 0),
  CONSTRAINT "attendance_late_stay_allowed_until_check" CHECK ("allowed_until" > "created_at"),
  CONSTRAINT "attendance_late_stay_school_session_fk" FOREIGN KEY ("school_id", "session_id")
    REFERENCES "attendance_sessions"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "attendance_late_stay_school_branch_fk" FOREIGN KEY ("school_id", "branch_id")
    REFERENCES "school_branches"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_late_stay_school_student_fk" FOREIGN KEY ("school_id", "student_id")
    REFERENCES "students"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_late_stay_school_record_fk" FOREIGN KEY ("school_id", "attendance_record_id")
    REFERENCES "student_attendance_records"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "attendance_late_stay_authorized_by_fk" FOREIGN KEY ("school_id", "authorized_by_membership_id")
    REFERENCES "school_memberships"("school_id", "id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_late_stay_grant_fk" FOREIGN KEY ("passkey_grant_id")
    REFERENCES "auth_passkey_step_up_grants"("id") ON DELETE RESTRICT,
  CONSTRAINT "attendance_late_stay_consumed_attempt_fk" FOREIGN KEY ("school_id", "consumed_attempt_id")
    REFERENCES "attendance_verification_attempts"("school_id", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_late_stay_one_open_per_student_idx"
  ON "attendance_late_stay_authorizations" ("school_id", "session_id", "student_id")
  WHERE "revoked_at" IS NULL AND "consumed_at" IS NULL;
CREATE INDEX IF NOT EXISTS "attendance_late_stay_branch_due_idx"
  ON "attendance_late_stay_authorizations" ("school_id", "branch_id", "allowed_until")
  WHERE "revoked_at" IS NULL AND "consumed_at" IS NULL;

CREATE TABLE IF NOT EXISTS "casa_in_app_notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "school_id" uuid REFERENCES "schools"("id") ON DELETE CASCADE,
  "branch_id" uuid,
  "recipient_school_membership_id" uuid,
  "recipient_internal_membership_id" uuid REFERENCES "casa_internal_memberships"("id") ON DELETE CASCADE,
  "audience" varchar(40) NOT NULL,
  "event_type" varchar(80) NOT NULL,
  "title" varchar(160) NOT NULL,
  "body" varchar(600) NOT NULL,
  "action_url" varchar(500),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "casa_in_app_notifications_recipient_xor_check" CHECK (
    ("recipient_school_membership_id" IS NOT NULL AND "recipient_internal_membership_id" IS NULL AND "school_id" IS NOT NULL)
    OR
    ("recipient_school_membership_id" IS NULL AND "recipient_internal_membership_id" IS NOT NULL)
  ),
  CONSTRAINT "casa_in_app_notifications_event_check" CHECK (length(trim("event_type")) > 0),
  CONSTRAINT "casa_in_app_notifications_title_check" CHECK (length(trim("title")) > 0),
  CONSTRAINT "casa_in_app_notifications_body_check" CHECK (length(trim("body")) > 0),
  CONSTRAINT "casa_in_app_notifications_school_branch_fk" FOREIGN KEY ("school_id", "branch_id")
    REFERENCES "school_branches"("school_id", "id") ON DELETE CASCADE,
  CONSTRAINT "casa_in_app_notifications_school_member_fk" FOREIGN KEY ("school_id", "recipient_school_membership_id")
    REFERENCES "school_memberships"("school_id", "id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "casa_in_app_notifications_school_unread_idx"
  ON "casa_in_app_notifications" ("school_id", "recipient_school_membership_id", "created_at" DESC)
  WHERE "read_at" IS NULL;
CREATE INDEX IF NOT EXISTS "casa_in_app_notifications_internal_unread_idx"
  ON "casa_in_app_notifications" ("recipient_internal_membership_id", "created_at" DESC)
  WHERE "read_at" IS NULL;
CREATE INDEX IF NOT EXISTS "casa_in_app_notifications_created_idx"
  ON "casa_in_app_notifications" ("created_at" DESC);

-- ---------------------------------------------------------------------------
-- Guardian attendance delivery cut-over: FCM is authoritative for new events.
-- Existing SMS rows remain as audit history, but no unsent attendance SMS is
-- permitted to leave CASA after M34B.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION casa_guardian_push_from_presence_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_event_type varchar(40);
BEGIN
  v_event_type := CASE
    WHEN NEW.event_type::text = 'CHECKED_IN' THEN 'STUDENT_CHECKED_IN'
    WHEN NEW.departure_result::text = 'EARLY' THEN 'STUDENT_EARLY_DEPARTURE'
    ELSE 'STUDENT_SIGNED_OUT'
  END;

  INSERT INTO guardian_push_outbox (
    school_id,
    student_id,
    guardian_id,
    device_id,
    attendance_record_id,
    presence_event_id,
    firebase_installation_id,
    event_type,
    title,
    body,
    icon_url,
    click_url,
    payload,
    status,
    attempt_count,
    available_at,
    created_at,
    updated_at
  )
  SELECT
    NEW.school_id,
    NEW.student_id,
    device.guardian_id,
    device.id,
    NEW.attendance_record_id,
    NEW.id,
    device.firebase_installation_id,
    v_event_type,
    school.name || ' · Attendance',
    CASE
      WHEN v_event_type = 'STUDENT_CHECKED_IN'
        THEN student_name.name || ' checked in at ' || to_char(NEW.occurred_at AT TIME ZONE school.timezone, 'HH24:MI') || '.'
      WHEN v_event_type = 'STUDENT_EARLY_DEPARTURE'
        THEN student_name.name || ' checked out early at ' || to_char(NEW.occurred_at AT TIME ZONE school.timezone, 'HH24:MI') || '.'
      ELSE student_name.name || ' checked out at ' || to_char(NEW.occurred_at AT TIME ZONE school.timezone, 'HH24:MI') || '.'
    END,
    NULL,
    NULL,
    jsonb_build_object(
      'schoolId', NEW.school_id::text,
      'studentId', NEW.student_id::text,
      'casaStudentId', student.casa_student_id,
      'studentName', student_name.name,
      'branchId', branch_context.branch_id,
      'branchName', branch_context.branch_name,
      'attendanceRecordId', NEW.attendance_record_id::text,
      'presenceEventId', NEW.id::text,
      'eventType', v_event_type,
      'occurredAt', NEW.occurred_at::text
    ),
    'PENDING',
    0,
    now(),
    now(),
    now()
  FROM students student
  JOIN schools school
    ON school.id = student.school_id
  CROSS JOIN LATERAL (
    SELECT concat_ws(
      ' ',
      student.first_name,
      nullif(student.middle_name, ''),
      student.last_name
    ) AS name
  ) student_name
  LEFT JOIN LATERAL (
    SELECT
      branch.id::text AS branch_id,
      branch.name AS branch_name
    FROM student_enrollments enrollment
    JOIN school_branch_class_arms map
      ON map.school_id = enrollment.school_id
     AND map.class_arm_id = enrollment.class_arm_id
    JOIN school_branches branch
      ON branch.school_id = map.school_id
     AND branch.id = map.branch_id
    WHERE enrollment.school_id = student.school_id
      AND enrollment.student_id = student.id
      AND enrollment.starts_on <= (NEW.occurred_at AT TIME ZONE school.timezone)::date
      AND (enrollment.ends_on IS NULL OR enrollment.ends_on >= (NEW.occurred_at AT TIME ZONE school.timezone)::date)
    ORDER BY enrollment.starts_on DESC, enrollment.created_at DESC
    LIMIT 1
  ) branch_context ON true
  JOIN guardian_push_devices device
    ON device.school_id = student.school_id
   AND device.student_id = student.id
   AND device.status = 'ACTIVE'
  JOIN guardians guardian
    ON guardian.school_id = device.school_id
   AND guardian.id = device.guardian_id
   AND guardian.status = 'ACTIVE'::guardian_status
  JOIN student_guardians link
    ON link.school_id = device.school_id
   AND link.id = device.student_guardian_link_id
   AND link.student_id = student.id
   AND link.guardian_id = device.guardian_id
   AND link.receives_notifications = true
  WHERE student.school_id = NEW.school_id
    AND student.id = NEW.student_id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guardian_push_from_presence_event_trigger ON student_presence_events;
CREATE TRIGGER guardian_push_from_presence_event_trigger
AFTER INSERT ON student_presence_events
FOR EACH ROW
EXECUTE FUNCTION casa_guardian_push_from_presence_event();

CREATE OR REPLACE FUNCTION casa_cancel_new_attendance_sms()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type::text IN (
    'STUDENT_CHECKED_IN',
    'STUDENT_SIGNED_OUT',
    'STUDENT_EARLY_DEPARTURE'
  ) THEN
    NEW.status := 'CANCELLED'::school_notification_delivery_status;
    NEW.last_error_code := 'M34B_FCM_CUTOVER';
    NEW.last_error_message := 'Guardian attendance delivery moved to Firebase Cloud Messaging.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cancel_new_attendance_sms_trigger ON school_notification_outbox;
CREATE TRIGGER cancel_new_attendance_sms_trigger
BEFORE INSERT ON school_notification_outbox
FOR EACH ROW
EXECUTE FUNCTION casa_cancel_new_attendance_sms();

UPDATE school_notification_outbox
SET
  status = 'CANCELLED'::school_notification_delivery_status,
  last_error_code = 'M34B_FCM_CUTOVER',
  last_error_message = 'Guardian attendance delivery moved to Firebase Cloud Messaging.',
  locked_at = NULL,
  updated_at = now()
WHERE event_type::text IN (
    'STUDENT_CHECKED_IN',
    'STUDENT_SIGNED_OUT',
    'STUDENT_EARLY_DEPARTURE'
  )
  AND status::text IN ('PENDING', 'RETRY', 'PROCESSING');

-- Action-needed in-app alert when guardian push permanently fails. This is
-- intentionally not scan-level noise: only terminal delivery failures enter
-- the durable school/internal notification centre.
CREATE OR REPLACE FUNCTION casa_notify_guardian_push_failed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_branch_id uuid;
  v_school_slug text;
  v_school_name text;
  v_student_name text;
BEGIN
  IF NEW.status <> 'FAILED' OR OLD.status = 'FAILED' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_branch_id := nullif(NEW.payload ->> 'branchId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_branch_id := NULL;
  END;

  SELECT slug, name INTO v_school_slug, v_school_name
  FROM schools WHERE id = NEW.school_id;
  v_student_name := coalesce(nullif(NEW.payload ->> 'studentName', ''), 'A student');

  INSERT INTO casa_in_app_notifications (
    school_id,
    branch_id,
    recipient_school_membership_id,
    recipient_internal_membership_id,
    audience,
    event_type,
    title,
    body,
    action_url,
    payload,
    created_at
  )
  SELECT
    NEW.school_id,
    v_branch_id,
    membership.id,
    NULL,
    'SCHOOL_OPERATOR',
    'GUARDIAN_PUSH_FAILED',
    'Guardian notification needs attention',
    v_student_name || ' has an attendance notification that could not be delivered after retries.',
    '/schools/' || v_school_slug || '/notifications',
    jsonb_build_object(
      'pushOutboxId', NEW.id::text,
      'schoolId', NEW.school_id::text,
      'branchId', v_branch_id,
      'studentId', NEW.student_id::text,
      'eventType', NEW.event_type,
      'lastError', NEW.last_error
    ),
    now()
  FROM school_memberships membership
  WHERE membership.school_id = NEW.school_id
    AND membership.status = 'ACTIVE'::school_membership_status
    AND (
      EXISTS (
        SELECT 1
        FROM school_branch_admin_assignments assignment
        WHERE assignment.school_id = membership.school_id
          AND assignment.membership_id = membership.id
          AND assignment.branch_id = v_branch_id
          AND assignment.is_active = true
      )
      OR (
        EXISTS (
          SELECT 1
          FROM school_branches branch
          WHERE branch.school_id = NEW.school_id
            AND branch.id = v_branch_id
            AND branch.is_headquarters = true
        )
        AND EXISTS (
          SELECT 1
          FROM school_membership_roles role
          WHERE role.school_id = membership.school_id
            AND role.membership_id = membership.id
            AND role.role IN ('OWNER'::school_membership_role, 'ADMIN'::school_membership_role)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM school_branch_admin_assignments assignment
          JOIN school_branches branch
            ON branch.school_id = assignment.school_id
           AND branch.id = assignment.branch_id
          WHERE assignment.school_id = membership.school_id
            AND assignment.membership_id = membership.id
            AND assignment.is_active = true
            AND branch.is_headquarters = false
        )
      )
    );

  INSERT INTO casa_in_app_notifications (
    school_id,
    branch_id,
    recipient_school_membership_id,
    recipient_internal_membership_id,
    audience,
    event_type,
    title,
    body,
    action_url,
    payload,
    created_at
  )
  SELECT
    NEW.school_id,
    v_branch_id,
    NULL,
    internal.id,
    'CASA_INTERNAL',
    'GUARDIAN_PUSH_FAILED',
    'Guardian push failed · ' || coalesce(v_school_name, 'School'),
    v_student_name || ' has an attendance notification that could not be delivered after retries.',
    '/internal/schools/' || NEW.school_id::text,
    jsonb_build_object(
      'pushOutboxId', NEW.id::text,
      'schoolId', NEW.school_id::text,
      'branchId', v_branch_id,
      'studentId', NEW.student_id::text,
      'eventType', NEW.event_type,
      'lastError', NEW.last_error
    ),
    now()
  FROM casa_internal_memberships internal
  WHERE internal.status = 'ACTIVE';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guardian_push_failed_notification_trigger ON guardian_push_outbox;
CREATE TRIGGER guardian_push_failed_notification_trigger
AFTER UPDATE OF status ON guardian_push_outbox
FOR EACH ROW
EXECUTE FUNCTION casa_notify_guardian_push_failed();
