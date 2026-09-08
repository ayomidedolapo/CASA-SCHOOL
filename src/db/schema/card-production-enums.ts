import {
  pgEnum,
} from "drizzle-orm/pg-core";

export const studentCardTemplateStatusEnum =
  pgEnum(
    "student_card_template_status",
    [
      "DRAFT",
      "ACTIVE",
      "RETIRED",
    ],
  );

export const studentCardProductionStatusEnum =
  pgEnum(
    "student_card_production_status",
    [
      "READY",
      "EXPORTED",
      "PRINTED",
    ],
  );

export const studentCardProductionEventTypeEnum =
  pgEnum(
    "student_card_production_event_type",
    [
      "CARD_PRODUCTION_READY",
      "CARD_PRODUCTION_EXPORTED",
      "CARD_PRODUCTION_PRINTED",
      "PUBLIC_LINK_ROTATED",
    ],
  );

export const studentCardProductionActorKindEnum =
  pgEnum(
    "student_card_production_actor_kind",
    [
      "SCHOOL_MEMBER",
      "CASA_INTERNAL",
    ],
  );