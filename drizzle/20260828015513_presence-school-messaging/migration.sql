CREATE TYPE "attendance_departure_result" AS ENUM('NOT_RUN', 'NORMAL', 'EARLY', 'OUTSIDE_WINDOW', 'MANUAL');--> statement-breakpoint
CREATE TYPE "attendance_operation" AS ENUM('CHECK_IN', 'CHECK_OUT');--> statement-breakpoint
CREATE TYPE "attendance_presence_event_type" AS ENUM('CHECKED_IN', 'CHECKED_OUT');--> statement-breakpoint
CREATE TYPE "attendance_presence_state" AS ENUM('ON_CAMPUS', 'SIGNED_OUT');--> statement-breakpoint
CREATE TYPE "school_messaging_sender_status" AS ENUM('PENDING_SETUP', 'ACTIVE', 'SUSPENDED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "school_notification_delivery_status" AS ENUM('PENDING', 'PROCESSING', 'RETRY', 'SENT', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "school_notification_event_type" AS ENUM('STUDENT_CHECKED_IN', 'STUDENT_SIGNED_OUT', 'STUDENT_EARLY_DEPARTURE');--> statement-breakpoint
CREATE TABLE "student_presence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"attendance_record_id" uuid NOT NULL,
	"attempt_id" uuid,
	"terminal_id" uuid,
	"card_id" uuid,
	"event_type" "attendance_presence_event_type" NOT NULL,
	"departure_result" "attendance_departure_result" DEFAULT 'NOT_RUN'::"attendance_departure_result" NOT NULL,
	"actor_membership_id" uuid,
	"reason" varchar(240),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_presence_events_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_presence_events_record_type_unique" UNIQUE("school_id","attendance_record_id","event_type"),
	CONSTRAINT "student_presence_events_departure_semantics_check" CHECK ((
          ("event_type" = 'CHECKED_IN' and "departure_result" = 'NOT_RUN')
          or
          ("event_type" = 'CHECKED_OUT' and "departure_result" <> 'NOT_RUN')
        )),
	CONSTRAINT "student_presence_events_early_departure_actor_reason_check" CHECK ("departure_result" <> 'EARLY' or (
          "actor_membership_id" is not null
          and "reason" is not null
          and length(trim("reason")) > 0
        ))
);
--> statement-breakpoint
CREATE TABLE "school_notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"attendance_record_id" uuid NOT NULL,
	"presence_event_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"event_type" "school_notification_event_type" NOT NULL,
	"recipient_phone" varchar(32) NOT NULL,
	"template_key" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "school_notification_delivery_status" DEFAULT 'PENDING'::"school_notification_delivery_status" NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" varchar(180),
	"last_error_code" varchar(80),
	"last_error_message" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_notification_outbox_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_notification_outbox_event_guardian_sender_unique" UNIQUE("school_id","presence_event_id","guardian_id","sender_id"),
	CONSTRAINT "school_notification_outbox_recipient_phone_not_blank_check" CHECK (length(trim("recipient_phone")) > 0),
	CONSTRAINT "school_notification_outbox_template_key_not_blank_check" CHECK (length(trim("template_key")) > 0),
	CONSTRAINT "school_notification_outbox_attempt_count_check" CHECK ("attempt_count" >= 0),
	CONSTRAINT "school_notification_outbox_sent_state_check" CHECK ("status" <> 'SENT' or "sent_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "school_whatsapp_senders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"display_phone_number" varchar(32) NOT NULL,
	"verified_name" varchar(160),
	"provider_business_account_id" varchar(120),
	"provider_phone_number_id" varchar(120),
	"provider_connection_ref" varchar(200),
	"status" "school_messaging_sender_status" DEFAULT 'PENDING_SETUP'::"school_messaging_sender_status" NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"activated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_whatsapp_senders_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "school_whatsapp_senders_phone_not_blank_check" CHECK (length(trim("display_phone_number")) > 0),
	CONSTRAINT "school_whatsapp_senders_active_provider_identity_check" CHECK ("status" <> 'ACTIVE' or (
          "provider_business_account_id" is not null
          and "provider_phone_number_id" is not null
          and "provider_connection_ref" is not null
          and "activated_at" is not null
        )),
	CONSTRAINT "school_whatsapp_senders_revoke_timestamp_check" CHECK ("status" <> 'REVOKED' or "revoked_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "attendance_policy_days" ADD COLUMN "normal_dismissal_at" time NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_policy_days" ADD COLUMN "check_out_closes_at" time NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD COLUMN "operation" "attendance_operation" DEFAULT 'CHECK_IN'::"attendance_operation" NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD COLUMN "departure_result" "attendance_departure_result" DEFAULT 'NOT_RUN'::"attendance_departure_result" NOT NULL;--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD COLUMN "presence_state" "attendance_presence_state" DEFAULT 'ON_CAMPUS'::"attendance_presence_state" NOT NULL;--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD COLUMN "departure_result" "attendance_departure_result" DEFAULT 'NOT_RUN'::"attendance_departure_result" NOT NULL;--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD COLUMN "checked_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD COLUMN "check_out_attempt_id" uuid;--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD COLUMN "check_out_terminal_id" uuid;--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD COLUMN "check_out_card_id" uuid;--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD COLUMN "check_out_verified_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD COLUMN "check_out_reason" varchar(240);--> statement-breakpoint
CREATE INDEX "student_presence_events_student_occurred_idx" ON "student_presence_events" ("school_id","student_id","occurred_at");--> statement-breakpoint
CREATE INDEX "school_notification_outbox_work_idx" ON "school_notification_outbox" ("status","available_at");--> statement-breakpoint
CREATE INDEX "school_notification_outbox_school_created_idx" ON "school_notification_outbox" ("school_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "school_whatsapp_senders_one_active_per_school_idx" ON "school_whatsapp_senders" ("school_id") WHERE "status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "school_whatsapp_senders_provider_phone_unique_idx" ON "school_whatsapp_senders" ("provider_phone_number_id") WHERE "provider_phone_number_id" is not null;--> statement-breakpoint
CREATE INDEX "school_whatsapp_senders_school_status_idx" ON "school_whatsapp_senders" ("school_id","status");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_checkout_attempt_fk" FOREIGN KEY ("school_id","check_out_attempt_id") REFERENCES "attendance_verification_attempts"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_checkout_terminal_fk" FOREIGN KEY ("school_id","check_out_terminal_id") REFERENCES "attendance_terminals"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_checkout_card_fk" FOREIGN KEY ("school_id","check_out_card_id") REFERENCES "student_identity_cards"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_school_checkout_verifier_fk" FOREIGN KEY ("school_id","check_out_verified_by_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_presence_events" ADD CONSTRAINT "student_presence_events_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "student_presence_events" ADD CONSTRAINT "student_presence_events_school_session_fk" FOREIGN KEY ("school_id","session_id") REFERENCES "attendance_sessions"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_presence_events" ADD CONSTRAINT "student_presence_events_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_presence_events" ADD CONSTRAINT "student_presence_events_school_record_fk" FOREIGN KEY ("school_id","attendance_record_id") REFERENCES "student_attendance_records"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_presence_events" ADD CONSTRAINT "student_presence_events_school_attempt_fk" FOREIGN KEY ("school_id","attempt_id") REFERENCES "attendance_verification_attempts"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_presence_events" ADD CONSTRAINT "student_presence_events_school_terminal_fk" FOREIGN KEY ("school_id","terminal_id") REFERENCES "attendance_terminals"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_presence_events" ADD CONSTRAINT "student_presence_events_school_card_fk" FOREIGN KEY ("school_id","card_id") REFERENCES "student_identity_cards"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_presence_events" ADD CONSTRAINT "student_presence_events_school_actor_fk" FOREIGN KEY ("school_id","actor_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "school_notification_outbox" ADD CONSTRAINT "school_notification_outbox_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "school_notification_outbox" ADD CONSTRAINT "school_notification_outbox_school_record_fk" FOREIGN KEY ("school_id","attendance_record_id") REFERENCES "student_attendance_records"("school_id","id");--> statement-breakpoint
ALTER TABLE "school_notification_outbox" ADD CONSTRAINT "school_notification_outbox_school_presence_event_fk" FOREIGN KEY ("school_id","presence_event_id") REFERENCES "student_presence_events"("school_id","id");--> statement-breakpoint
ALTER TABLE "school_notification_outbox" ADD CONSTRAINT "school_notification_outbox_school_guardian_fk" FOREIGN KEY ("school_id","guardian_id") REFERENCES "guardians"("school_id","id");--> statement-breakpoint
ALTER TABLE "school_notification_outbox" ADD CONSTRAINT "school_notification_outbox_school_sender_fk" FOREIGN KEY ("school_id","sender_id") REFERENCES "school_whatsapp_senders"("school_id","id");--> statement-breakpoint
ALTER TABLE "school_whatsapp_senders" ADD CONSTRAINT "school_whatsapp_senders_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "school_whatsapp_senders" ADD CONSTRAINT "school_whatsapp_senders_school_creator_fk" FOREIGN KEY ("school_id","created_by_membership_id") REFERENCES "school_memberships"("school_id","id");--> statement-breakpoint
ALTER TABLE "attendance_policy_days" ADD CONSTRAINT "attendance_policy_days_departure_time_order_check" CHECK ("normal_dismissal_at" <= "check_out_closes_at");--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD CONSTRAINT "attendance_attempts_operation_time_semantics_check" CHECK ((
          ("operation" = 'CHECK_IN' and "departure_result" = 'NOT_RUN')
          or
          ("operation" = 'CHECK_OUT' and "time_result" = 'NOT_RUN')
        ));--> statement-breakpoint
ALTER TABLE "attendance_verification_attempts" ADD CONSTRAINT "attendance_attempts_early_departure_actor_check" CHECK ("departure_result" <> 'EARLY' or "manual_verified_by_membership_id" is not null);--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_presence_state_check" CHECK ((
          ("presence_state" = 'ON_CAMPUS' and "checked_out_at" is null and "departure_result" = 'NOT_RUN')
          or
          ("presence_state" = 'SIGNED_OUT' and "checked_out_at" is not null and "departure_result" <> 'NOT_RUN')
        ));--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_checkout_time_check" CHECK ("checked_out_at" is null or "checked_out_at" >= "recorded_at");--> statement-breakpoint
ALTER TABLE "student_attendance_records" ADD CONSTRAINT "student_attendance_records_early_departure_check" CHECK ("departure_result" <> 'EARLY' or (
          "check_out_verified_by_membership_id" is not null
          and "check_out_reason" is not null
          and length(trim("check_out_reason")) > 0
        ));