import { pgEnum } from "drizzle-orm/pg-core";

export const schoolStatusEnum = pgEnum("school_status", [
  "ACTIVE",
  "SUSPENDED",
  "ARCHIVED",
]);

export const userStatusEnum = pgEnum("user_status", [
  "ACTIVE",
  "SUSPENDED",
  "ARCHIVED",
]);

export const schoolMembershipStatusEnum = pgEnum(
  "school_membership_status",
  ["ACTIVE", "INVITED", "SUSPENDED", "REVOKED"],
);

export const schoolMembershipRoleEnum = pgEnum(
  "school_membership_role",
  ["OWNER", "ADMIN", "SCHOOL_TECHNICIAN", "STAFF", "GUARDIAN", "STUDENT"],
);

export const academicPeriodStatusEnum = pgEnum(
  "academic_period_status",
  ["PLANNED", "ACTIVE", "CLOSED"],
);