CREATE TYPE "student_identity_card_event_type" AS ENUM('ISSUED', 'MARKED_LOST', 'REVOKED', 'REPLACED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "student_identity_card_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"event_type" "student_identity_card_event_type" NOT NULL,
	"reason" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_identity_card_events_school_id_id_unique" UNIQUE("school_id","id"),
	CONSTRAINT "student_identity_card_events_reason_not_blank_check" CHECK ("reason" is null or length(trim("reason")) > 0)
);
--> statement-breakpoint
CREATE INDEX "student_identity_card_events_student_created_idx" ON "student_identity_card_events" ("school_id","student_id","created_at");--> statement-breakpoint
CREATE INDEX "student_identity_card_events_card_created_idx" ON "student_identity_card_events" ("school_id","card_id","created_at");--> statement-breakpoint
ALTER TABLE "student_identity_card_events" ADD CONSTRAINT "student_identity_card_events_school_id_schools_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id");--> statement-breakpoint
ALTER TABLE "student_identity_card_events" ADD CONSTRAINT "student_identity_card_events_school_student_fk" FOREIGN KEY ("school_id","student_id") REFERENCES "students"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_identity_card_events" ADD CONSTRAINT "student_identity_card_events_school_card_fk" FOREIGN KEY ("school_id","card_id") REFERENCES "student_identity_cards"("school_id","id");--> statement-breakpoint
ALTER TABLE "student_identity_card_events" ADD CONSTRAINT "student_identity_card_events_school_actor_membership_fk" FOREIGN KEY ("school_id","actor_membership_id") REFERENCES "school_memberships"("school_id","id");